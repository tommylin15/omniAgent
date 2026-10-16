import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:omniagent_app/chat_api.dart';
import 'package:omniagent_app/pending_key_store.dart';

class TestPendingStore implements PendingKeyStore {
  final Map<String,String> records={};
  bool failWrite=false;
  @override
  String? read(String ownerId)=>records[ownerId];
  @override
  void write(String ownerId,String serialized){
    if(failWrite){throw StateError('blocked browser storage');}
    records[ownerId]=serialized;
  }
  @override
  void clear(String ownerId){records.remove(ownerId);}
}

const ownerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';


void main() {
  test('R08: definitive 503 before DB write clears pending without duplicate',() async{
    final storage=TestPendingStore();
    var messages=0;
    final api=ChatApi('a',pendingKeyStore:storage,
      client:MockClient((req) async{
        if(req.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        messages++;
        return http.Response('{"error":"dispatch_unavailable"}',503);
      }),baseUrl:'https://example.test');
    await api.bindVerifiedOwner();
    await expectLater(api.post('/v1/threads/t/messages',{'content':'blocked'}),
        throwsStateError);
    expect(messages,1);
    expect(api.hasPendingMessage('t'),isFalse);
    expect(storage.records[ownerA],contains('"items":[]'));
    api.close();
  });

  test('R08: lost response survives same-tab reload, readback never POSTS',() async{
    final storage=TestPendingStore();
    final keys=<String>[];
    final first=ChatApi('google-owner-a',pendingKeyStore:storage,
      client:MockClient((request) async{
        if(request.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        keys.add(request.headers['idempotency-key']!);
        throw StateError('connection died after PostgreSQL commit');
      }),baseUrl:'https://example.test');
    await first.bindVerifiedOwner();
    const path='/v1/threads/t/messages',content='private prompt never persist';
    await expectLater(first.post(path,{'content':content}),throwsStateError);
    expect(storage.records[ownerA],isNotNull);
    expect(storage.records[ownerA],isNot(contains(content)));
    expect(storage.records[ownerA],isNot(contains('google-owner-a')));
    expect(storage.records[ownerA],isNot(contains('Bearer')));
    first.close(); // Browser reload, not sign-out.

    var postCount=0;
    var getCount=0;
    final next=ChatApi('reloaded-google-token',pendingKeyStore:storage,
      client:MockClient((request) async{
        if(request.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        if(request.method=='POST'){postCount++;return http.Response('{}',202);}
        getCount++;
        expect(request.headers['idempotency-key'],keys.single);
        return http.Response(
          '{"turn":{"turnId":"committed-123","status":"COMPLETED"}}',200);
      }),baseUrl:'https://example.test');
    await next.bindVerifiedOwner();
    expect(next.hasPendingMessage('t'),isTrue);
    expect(await next.reconcileRecoveredMessage('t'),
      {'turnId':'committed-123','status':'COMPLETED'});
    expect(getCount,1);
    expect(postCount,0);
    expect(next.hasPendingMessage('t'),isFalse);
    expect(storage.records[ownerA],isNot(contains('committed-123')));
    next.close();
  });

  test('R08: racing DB commit yields null, blocks fresh key, later GET recovers',() async{
    final storage=TestPendingStore();
    var created=0;
    final first=ChatApi('a',pendingKeyStore:storage,
      client:MockClient((request) async{
        if(request.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        created++;
        throw StateError('network failure');
      }),baseUrl:'https://example.test');
    await first.bindVerifiedOwner();
    await expectLater(first.post('/v1/threads/t/messages',{'content':'one'}),
        throwsStateError);
    first.close();

    var lookup=0;
    final second=ChatApi('a-again',pendingKeyStore:storage,
      client:MockClient((request) async{
        if(request.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        if(request.method=='POST'){created++;return http.Response('{}',202);}
        lookup++;
        return http.Response(lookup==1?'{"turn":null}':
            '{"turn":{"turnId":"late-commit","status":"RUNNING"}}',200);
      }),baseUrl:'https://example.test');
    await second.bindVerifiedOwner();
    expect(await second.reconcileRecoveredMessage('t'),isNull);
    expect(second.hasPendingMessage('t'),isTrue);
    await expectLater(second.post('/v1/threads/t/messages',{'content':'two'}),
        throwsStateError);
    expect(created,1);
    expect(await second.reconcileRecoveredMessage('t'),
        {'turnId':'late-commit','status':'RUNNING'});
    expect(second.hasPendingMessage('t'),isFalse);
    second.close();
  });

  test('R08: Owner partition and explicit logout remove only that Owner',() async{
    final store=TestPendingStore();
    Future<ChatApi> bind(String id) async{
      final api=ChatApi(id,pendingKeyStore:store,
        client:MockClient((req) async{
          if(req.url.path=='/v1/me'){
            return http.Response('{"ownerId":"${id=='a'?ownerA:ownerB}"}',200);
          }
          throw StateError('dropped response');
        }),baseUrl:'https://example.test');
      await api.bindVerifiedOwner();
      return api;
    }
    final a=await bind('a');
    await expectLater(a.post('/v1/threads/t/messages',{'content':'a'}),throwsStateError);
    final b=await bind('b');
    expect(b.hasPendingMessage('t'),isFalse);
    await expectLater(b.post('/v1/threads/t/messages',{'content':'b'}),throwsStateError);
    expect(store.records.keys.toSet(),{ownerA,ownerB});
    a.close(clearPersistedPending:true);
    expect(store.records.containsKey(ownerA),isFalse);
    expect(store.records.containsKey(ownerB),isTrue);
    b.close(clearPersistedPending:true);
    expect(store.records,isEmpty);
  });

  test('R08: browser storage denied blocks POST before any network dispatch',() async{
    final store=TestPendingStore()..failWrite=true;
    var messageCalls=0;
    final api=ChatApi('a',pendingKeyStore:store,
      client:MockClient((req) async{
        if(req.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        messageCalls++;
        return http.Response('{}',202);
      }),baseUrl:'https://example.test');
    await api.bindVerifiedOwner();
    await expectLater(api.post('/v1/threads/t/messages',{'content':'secret'}),
        throwsStateError);
    expect(messageCalls,0);
    api.close();
  });

  test('R08: corrupt persisted metadata must not be silently overwritten',() async{
    final store=TestPendingStore();
    store.records[ownerA]='{"version":1,"items":[{"threadId":"t","key":"invalid"}]}';
    var posts=0;
    final api=ChatApi('a',pendingKeyStore:store,
      client:MockClient((req) async{
        if(req.url.path=='/v1/me'){
          return http.Response('{"ownerId":"$ownerA"}',200);
        }
        posts++;
        return http.Response('{}',202);
      }),baseUrl:'https://example.test');
    await api.bindVerifiedOwner();
    await expectLater(api.post('/v1/threads/t/messages',{'content':'try'}),
        throwsStateError);
    expect(posts,0);
    expect(store.records[ownerA],contains('invalid'));
    api.close();
  });

  test('uncertain POST reuses UUID; confirmed same message is a new intent',
      () async {
    final keys = <String>[];
    var attempts = 0;
    final client = MockClient((request) async {
      keys.add(request.headers['idempotency-key'] ?? '');
      attempts++;
      if (attempts == 1) throw StateError('simulated disconnect');
      return http.Response('{"turn":{"turn_id":"turn-a"}}', 202);
    });
    final api = ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const path='/v1/threads/owner-a-thread/messages';
    const payload={'content':'same user message'};
    await expectLater(api.post(path,payload),throwsStateError);
    await api.post(path,payload);
    await api.post(path,payload);
    expect(keys,hasLength(3));
    expect(keys[0],keys[1]);
    expect(keys[2],isNot(keys[1]));
    expect(keys[0],matches(RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    api.close();
  });
  test('malformed HTTP 2xx response retains the original POST intent',() async {
    final keys=<String>[];
    var n=0;
    final client=MockClient((req) async {
      keys.add(req.headers['idempotency-key']??'');
      return http.Response(++n == 1 ? '{broken' : '{"turn":{"turn_id":"turn-a"}}',202);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const path='/v1/threads/t/messages', payload={'content':'verify receipt'};
    await expectLater(api.post(path,payload),throwsFormatException);
    await api.post(path,payload);
    expect(keys,hasLength(2));
    expect(keys[0],keys[1]);
    api.close();
  });

  test('2xx with missing durable turn ID keeps the original key', () async {
    final keys = <String>[];
    var calls = 0;
    final client = MockClient((request) async {
      keys.add(request.headers['idempotency-key'] ?? '');
      calls++;
      return http.Response(calls == 1 ? '{}' :
          '{"turn":{"turn_id":"durable-turn"}}', 202);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const path='/v1/threads/a/messages',body={'content':'one message'};
    await expectLater(api.post(path,body),throwsStateError);
    await api.post(path,body);
    expect(keys,hasLength(2));
    expect(keys.first,keys.last);
    api.close();
  });

  test('2xx without a thread ID does not confirm new thread creation', () async {
    final keys=<String>[];
    var calls=0;
    final client=MockClient((request) async {
      keys.add(request.headers['idempotency-key'] ?? '');
      calls++;
      return http.Response(calls == 1 ? '{}' :
          '{"thread_id":"durable-thread"}', 201);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const body={'runtime':'gemini','model':'gemini-3.5-flash-lite'};
    await expectLater(api.post('/v1/threads',body),throwsStateError);
    await api.post('/v1/threads',body);
    expect(keys.first,keys.last);
    api.close();
  });

  test('reconciles uncertain POST without resending original message',() async{
    String? sentKey,readKey;
    var sends=0;
    final client=MockClient((req) async{
      if(req.method=='POST'){
        sends++;
        sentKey=req.headers['idempotency-key'];
        if(sends==1)throw StateError('lost 202');
        return http.Response('{"turn":{"turn_id":"new-turn"}}',202);
      }
      readKey=req.headers['idempotency-key'];
      return http.Response('{"turn":{"turnId":"durable-turn","status":"COMPLETED"}}',200);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const path='/v1/threads/t/messages',content='hello';
    await expectLater(api.post(path,{'content':content}),throwsStateError);
    expect(await api.reconcilePendingMessage('t',content),
      {'turnId':'durable-turn','status':'COMPLETED'});
    expect(readKey,sentKey);
    expect(sends,1);
    await api.post(path,{'content':content});
    expect(sends,2);
    api.close();
  });
  test('missing readback row retains original key for safe retry',() async{
    final keys=<String?>[];
    final client=MockClient((req) async{
      if(req.method=='GET')return http.Response('{"turn":null}',200);
      keys.add(req.headers['idempotency-key']);
      if(keys.length==1)throw StateError('network');
      return http.Response('{"turn":{"turn_id":"confirmed"}}',202);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    const path='/v1/threads/t/messages',content='hello';
    await expectLater(api.post(path,{'content':content}),throwsStateError);
    expect(await api.reconcilePendingMessage('t',content),isNull);
    await api.post(path,{'content':content});
    expect(keys.first,keys.last);
    api.close();
  });

  test('different bodies use different IDs; GET has no POST key',() async {
    final keys=<String?>[];
    final client=MockClient((req) async {
      keys.add(req.headers['idempotency-key']);
      if(req.method=='POST') throw StateError('unknown outcome');
      return http.Response('{}',200);
    });
    final api=ChatApi('owner-a',client:client,baseUrl:'https://example.test');
    await expectLater(api.post('/v1/threads/t/messages',{'content':'one'}),throwsStateError);
    await expectLater(api.post('/v1/threads/t/messages',{'content':'two'}),throwsStateError);
    await api.get('/v1/threads');
    expect(keys[0],isNot(keys[1]));
    expect(keys[2],isNull);
    api.close();
  });
  test('new OAuth session cannot reuse prior Owner request intent',() async {
    final keys=<String>[];
    Future<void> failPost(String owner) async {
      final client=MockClient((req) async {
        keys.add(req.headers['idempotency-key']??'');
        throw StateError('unknown outcome');
      });
      final api=ChatApi(owner,client:client,baseUrl:'https://example.test');
      await expectLater(api.post('/v1/threads',{'runtime':'gemini'}),throwsStateError);
      api.close();
    }
    await failPost('owner-a');
    await failPost('owner-b');
    expect(keys[0],isNot(keys[1]));
  });
}
