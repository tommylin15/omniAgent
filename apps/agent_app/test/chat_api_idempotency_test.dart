import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:omniagent_app/chat_api.dart';

void main() {
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
