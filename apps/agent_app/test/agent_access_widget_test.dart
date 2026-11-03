import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omniagent_app/agent_access_page.dart';
import 'package:omniagent_app/chat_api.dart';

class AccessDraftApi extends ChatApi {
  AccessDraftApi({this.denied = false, this.conflict = false}) : super('test');
  final bool denied, conflict;
  final writes = <Map<String, dynamic>>[];
  @override
  Future<dynamic> get(String path) async {
    if (denied) throw StateError('403');
    return {'version': 3, 'updatedAt': null, 'owners': [
      {'ownerId': '11111111-1111-4111-8111-111111111111', 'models': [
        {'runtime': 'gemini', 'model': 'gemini-2.5-flash-lite', 'routeProfile': 'private-lite'}
      ], 'tools': ['calendar.read']}
    ]};
  }
  @override
  Future<dynamic> put(String path, Map<String, dynamic> body) async {
    writes.add({'path': path, ...body});
    if (conflict) throw StateError('409');
    return {'version': 4, 'updatedAt': null, 'owners': body['owners']};
  }
}

void main() {
  Future<void> open(WidgetTester tester, AccessDraftApi api) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.binding.setSurfaceSize(const Size(1100, 1100));
    await tester.pumpWidget(MaterialApp(home: AgentAccessPage(api)));
    await tester.pumpAndSettle();
  }
  testWidgets('edits structured Owner/model/tool grants as a versioned draft', (tester) async {
    final api = AccessDraftApi();
    await open(tester, api);
    expect(find.textContaining('不會啟用模型'), findsOneWidget);
    expect(find.text('草稿版本：3；尚未生效'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, '工具 grant 名稱'), 'drive.read');
    await tester.tap(find.text('加入工具'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('儲存授權草稿'));
    await tester.tap(find.text('儲存授權草稿'));
    await tester.pumpAndSettle();
    expect(api.writes.single['path'], '/v1/admin/agent-access');
    expect(api.writes.single['expectedVersion'], 3);
    final owner = (api.writes.single['owners'] as List).single as Map;
    expect(owner['tools'], ['calendar.read', 'drive.read']);
    expect((owner['models'] as List).single['routeProfile'], 'private-lite');
    expect(find.text('草稿版本：4；尚未生效'), findsOneWidget);
    expect(find.text('授權草稿已儲存並讀回，尚未生效'), findsOneWidget);
  });
  testWidgets('invalid Owner never submits and permission failures show no editor', (tester) async {
    final api = AccessDraftApi();
    await open(tester, api);
    await tester.enterText(find.widgetWithText(TextFormField, 'Owner UUID'), 'forged');
    await tester.ensureVisible(find.text('儲存授權草稿'));
    await tester.tap(find.text('儲存授權草稿'));
    await tester.pumpAndSettle();
    expect(api.writes, isEmpty);
    await tester.pumpWidget(MaterialApp(home: AgentAccessPage(AccessDraftApi(denied: true), key: UniqueKey())));
    await tester.pumpAndSettle();
    expect(find.textContaining('無法讀取授權草稿'), findsOneWidget);
    expect(find.text('儲存授權草稿'), findsNothing);
  });
  testWidgets('CAS failure preserves editable draft and original version', (tester) async {
    final api = AccessDraftApi(conflict: true);
    await open(tester, api);
    await tester.ensureVisible(find.text('儲存授權草稿'));
    await tester.tap(find.text('儲存授權草稿'));
    await tester.pumpAndSettle();
    expect(find.textContaining('草稿保留'), findsOneWidget);
    expect(find.text('草稿版本：3；尚未生效'), findsOneWidget);
    expect(api.writes.single['expectedVersion'], 3);
  });
}
