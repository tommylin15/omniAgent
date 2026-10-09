import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omniagent_app/auth_session.dart';
import 'package:omniagent_app/chat_api.dart';
import 'package:omniagent_app/chat_page.dart';
import 'package:omniagent_app/main.dart';

class FakeChatApi extends ChatApi {
  FakeChatApi({this.withApproval = false}) : super('test');
  final bool withApproval;
  final writes = <Map<String, dynamic>>[];

  @override
  Future<dynamic> get(String path) async => {
        'items': [
          if (withApproval)
            {
              'thread_id': 'thread-1',
              'runtime': 'gemini',
              'model': 'test-model'
            }
        ]
      };

  @override
  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    writes.add({'path': path, ...body});
    if (path == '/v1/threads' || path.endsWith('/fork')) {
      return {
        'thread_id': 'thread-1',
        'runtime': 'gemini',
        'model': 'test-model'
      };
    }
    if (path.endsWith('/messages')) {
      return {
        'turn': {'turn_id': 'turn-1', 'status': 'QUEUED'}
      };
    }
    return {'status': 'APPROVED'};
  }

  @override
  Future<List<Map<String, dynamic>>> events(
          String threadId, int cursor) async =>
      [
        if (cursor < 0 && withApproval)
          {
            'event_id': 'approval-1',
            'seq': 0,
            'event_type': 'approval_request',
            'turn_id': 'turn-1',
            'payload': {
              'request_id': 'request-1',
              'params_digest': 'sha256:${List.filled(64, 'a').join()}',
              'operation': 'shell'
            }
          },
        if (cursor < 0 &&
            !withApproval &&
            writes.any((write) => '${write['path']}'.endsWith('/messages')))
          {
            'event_id': 'message-1',
            'seq': 0,
            'event_type': 'item_upsert',
            'turn_id': 'turn-1',
            'payload': {'role': 'user', 'content': 'hello'}
          },
      ];
}

void main() {
  for (final selection in {
    'Codex': 'gpt-6-luna',
    'Gemini': 'gemini-3.1-pro-preview',
    'OpenRouter': 'google/gemma-4-31b-it:free',
    'Groq（型號預覽）': 'llama-3.1-8b-instant'
  }.entries) {
    testWidgets('selects ${selection.key} model', (tester) async {
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.binding.setSurfaceSize(const Size(1000, 900));
      final api = FakeChatApi();
      await tester.pumpWidget(MaterialApp(home: ChatPage(api)));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text(selection.key).last);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField).first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, selection.value);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(MenuItemButton, selection.value).last);
      await tester.pumpAndSettle();
      if (selection.key.startsWith('Groq')) {
        expect(find.text('Groq 尚未接通，目前僅提供型號預覽。'), findsOneWidget);
        expect(
            tester
                .widget<FilledButton>(find.widgetWithText(FilledButton, '建立對話'))
                .onPressed,
            isNull);
        expect(api.writes, isEmpty);
      } else {
        await tester.tap(find.text('建立對話'));
        await tester.pumpAndSettle();
        expect(api.writes.first['model'], selection.value);
        expect(api.writes.first['runtime'], selection.key.toLowerCase());
      }
    });
  }

  test('logout discards the previous Chat API session immediately', () async {
    final sessions = <String?>[];
    var failures = 0;
    final controller = AuthSessionController(
      onSession: (api) => sessions.add(api?.token),
      onError: () => failures++,
    );
    await controller.update(() async => 'alice-token');
    expect(controller.current?.token, 'alice-token');
    await controller.update(null);
    expect(controller.current, isNull);
    expect(sessions, [null, 'alice-token', null]);
    expect(failures, 0);
    controller.dispose();
  });

  test('stale OAuth resolution cannot restore the previous user', () async {
    final pendingAlice = Completer<String?>();
    final changes = <String?>[];
    final controller = AuthSessionController(
      onSession: (api) => changes.add(api?.token),
      onError: () => fail('unexpected token error'),
    );
    final alice = controller.update(() => pendingAlice.future);
    await controller.update(() async => 'bob-token');
    pendingAlice.complete('alice-token');
    await alice;
    expect(controller.current?.token, 'bob-token');
    expect(changes, [null, null, 'bob-token']);
    controller.dispose();
  });

  test('failed OAuth exchange leaves no prior owner session', () async {
    final changes = <String?>[];
    var errors = 0;
    final controller = AuthSessionController(
      onSession: (api) => changes.add(api?.token),
      onError: () => errors++,
    );
    await controller.update(() async => 'alice-token');
    await controller.update(() async => null);
    expect(controller.current, isNull);
    expect(errors, 1);
    expect(changes.last, isNull);
    controller.dispose();
  });

  testWidgets('standalone login refuses missing API configuration',
      (tester) async {
    await tester.pumpWidget(const OmniAgentApp());
    expect(find.text('omniAgent'), findsOneWidget);
    expect(find.byKey(const Key('twin-beast-mascot-slot')), findsOneWidget);
    expect(find.text('登入或 API 尚未設定'), findsOneWidget);
  });

  testWidgets('threads and queued messages use only omniAgent routes',
      (tester) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.binding.setSurfaceSize(const Size(1000, 800));
    final api = FakeChatApi();
    await tester.pumpWidget(MaterialApp(home: ChatPage(api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('twin-beast-mascot-slot')), findsOneWidget);
    expect(find.text('今天想一起完成什麼？'), findsOneWidget);
    expect(find.textContaining('建立後這個對話會沿用這組設定'), findsOneWidget);
    expect(find.text('Gemini', skipOffstage: false), findsOneWidget);
    expect(find.text('OpenRouter', skipOffstage: false), findsOneWidget);
    expect(find.text('Codex', skipOffstage: false), findsOneWidget);
    expect(find.text('Groq', skipOffstage: false), findsNothing);
    await tester.tap(find.text('建立對話'));
    await tester.pumpAndSettle();
    expect(api.writes.first['path'], '/v1/threads');
    expect(api.writes.first['assistantProfile'], 'default');
    await tester.enterText(find.byType(TextField).last, 'hello');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(api.writes.last['path'], '/v1/threads/thread-1/messages');
    expect(find.text('訊息已排隊，等待執行環境接手'), findsOneWidget);
    expect(find.text('hello'), findsOneWidget);
    expect(
        api.writes
            .any((write) => '${write['path']}'.startsWith('/api/v1/me/chats')),
        isFalse);
  });

  testWidgets(
      'new authenticated account discards old ChatPage state and event cursor',
      (tester) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.binding.setSurfaceSize(const Size(1000, 800));
    final alice = FakeChatApi();
    final bob = FakeChatApi();
    await tester.pumpWidget(MaterialApp(
      home: ChatPage(alice, key: ObjectKey(alice)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('建立對話'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'hello');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.text('hello'), findsOneWidget);

    // The app's account-session boundary changes the ChatPage key.
    // Flutter must dispose Alice's State, including her event cursor.
    await tester.pumpWidget(MaterialApp(
      home: ChatPage(bob, key: ObjectKey(bob)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('hello'), findsNothing);
    expect(find.text('今天想一起完成什麼？'), findsOneWidget);
    expect(bob.writes, isEmpty);
    await tester.tap(find.text('建立對話'));
    await tester.pumpAndSettle();
    expect(bob.writes.single['path'], '/v1/threads');
  });

  testWidgets('request-bound approval and tool panel belong to omniAgent',
      (tester) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.binding.setSurfaceSize(const Size(1000, 800));
    final api = FakeChatApi(withApproval: true);
    await tester.pumpWidget(MaterialApp(home: ChatPage(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('gemini · test-model').first);
    await tester.pumpAndSettle();
    expect(find.text('需要核准的操作'), findsOneWidget);
    expect(find.textContaining('事件已同步'), findsOneWidget);
    await tester.tap(find.text('允許'));
    await tester.pumpAndSettle();
    expect(api.writes.single['path'],
        '/v1/threads/thread-1/turns/turn-1/approvals/request-1');
    expect(api.writes.single['paramsDigest'],
        'sha256:${List.filled(64, 'a').join()}');
    await tester.tap(find.byTooltip('工具與技能'));
    await tester.pumpAndSettle();
    expect(find.text('工具與能力'), findsOneWidget);
    expect(find.text('管理 API 尚未接線；工具事件仍可在對話中檢視'), findsOneWidget);
  });

  testWidgets('moved markdown display keeps code as text', (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: MarkdownText('# title\n```dart\nfinal answer = 42;\n```'))));
    expect(find.text('title'), findsOneWidget);
    expect(find.text('final answer = 42;'), findsOneWidget);
  });
}
