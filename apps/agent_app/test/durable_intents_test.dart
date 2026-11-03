import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:omniagent_app/chat_api.dart';
import 'package:omniagent_app/pending_key_store_stub.dart';

void main(){
  test('another device cancelling the key clears only its verified tombstone',() async{
    const key='22222222-2222-4222-8222-222222222222';
    final pending=createPendingKeyStore();
    pending.write('11111111-1111-4111-8111-111111111111',jsonEncode({
      'version':1,'items':[{'threadId':'thread','key':key}]}));
    final api=ChatApi('fixture',baseUrl:'https://example.invalid',pendingKeyStore:pending,
      client:MockClient((request) async{
        if(request.url.path=='/v1/me'){return http.Response(jsonEncode({
          'ownerId':'11111111-1111-4111-8111-111111111111','durableIntentsEnabled':true}),200);}
        if(request.url.path.endsWith('/$key')){return http.Response(jsonEncode({'intent':{'key':key,'state':'cancelled'}}),200);}
        return http.Response('{"intent":null}',200);
      }));
    await api.bindVerifiedOwner();expect(api.hasPendingMessage('thread'),isTrue);
    await api.reconcileRecoveredMessage('thread');expect(api.hasPendingMessage('thread'),isFalse);
  });
  test('reserves the same durable intent before posting a message',() async{
    final calls=<String>[];String? key;
    final api=ChatApi('fixture',baseUrl:'https://example.invalid',pendingKeyStore:createPendingKeyStore(),
      client:MockClient((request) async{
        calls.add(request.url.path);
        if(request.url.path=='/v1/me'){return http.Response(jsonEncode({
          'ownerId':'11111111-1111-4111-8111-111111111111','durableIntentsEnabled':true}),200);}
        if(request.url.path.endsWith('/message-intents')){
          key=request.headers['Idempotency-Key'];
          return http.Response(jsonEncode({'key':key,'state':'prepared'}),201);
        }
        expect(request.headers['Idempotency-Key'],key);
        return http.Response('{"turn":{"turn_id":"33333333-3333-4333-8333-333333333333"}}',202);
      }));
    await api.bindVerifiedOwner();
    await api.post('/v1/threads/thread/messages',{'content':'hello'});
    expect(calls,['/v1/me','/v1/threads/thread/message-intents','/v1/threads/thread/messages']);
  });
  test('a new device recovers a prepared intent and blocks a fresh send',() async{
    const key='22222222-2222-4222-8222-222222222222';int posts=0;
    final api=ChatApi('fixture',baseUrl:'https://example.invalid',pendingKeyStore:createPendingKeyStore(),
      client:MockClient((request) async{
        if(request.method=='POST'){posts++;}
        if(request.url.path=='/v1/me'){return http.Response(jsonEncode({
          'ownerId':'11111111-1111-4111-8111-111111111111','durableIntentsEnabled':true}),200);}
        if(request.url.path.endsWith('/message-intents')){return http.Response(jsonEncode({
          'intent':{'key':key,'state':'prepared'}}),200);}
        return http.Response('{"turn":null}',200);
      }));
    await api.bindVerifiedOwner();
    expect(await api.reconcileRecoveredMessage('thread'),isNull);
    expect(api.hasPendingMessage('thread'),isTrue);expect(posts,0);
    await expectLater(api.post('/v1/threads/thread/messages',{'content':'different intent'}),throwsStateError);
    expect(posts,0);
  });
}
