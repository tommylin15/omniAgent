import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omniagent_app/chat_api.dart';
import 'package:omniagent_app/router_usage_page.dart';

class FakeRouterStatsApi extends ChatApi {
  FakeRouterStatsApi() : super('fixture-only');
  @override
  Future<dynamic> get(String path) async {
    if(path!='/v1/admin/router-usage?days=7') {
      throw StateError('unexpected dashboard URL');
    }
    return {
      'generatedAt':'2026-10-17T00:00:00.000Z','days':7,'timezone':'UTC',
      'sources':{'chatTurns':'available','sharedGemini':'available'},
      'truncated':false,
      'rows':[
        {'source':'shared_gemini','day':'2026-10-17','project':'omniagent',
          'ownerId':'00000000-0000-4000-8000-000000000001',
          'provider':'gemini','model':'gemini-3.5-flash-lite',
          'status':'completed','calls':2,'tokens':25},
        {'source':'shared_gemini','day':'2026-10-17','project':'life-assistant',
          'ownerId':'00000000-0000-4000-8000-000000000002',
          'provider':'gemini','model':'gemini-3.5-flash-lite',
          'status':'failed','calls':1,'tokens':null},
        {'source':'chat_turns','day':'2026-10-17','project':'omniagent',
          'ownerId':'00000000-0000-4000-8000-000000000001',
          'provider':'codex','model':'gpt-6','status':'completed',
          'calls':2,'tokens':null},
      ]
    };
  }
}

void main() {
  testWidgets('war room separates invocation/turn totals and filters Owner',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(950,900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:RouterUsagePage(FakeRouterStatsApi())));
    await tester.pumpAndSettle();
    expect(find.text('AI Router 戰情室'),findsOneWidget);
    expect(find.text('Gateway 請求'),findsOneWidget);
    expect(find.text('Chat 對話回合'),findsOneWidget);
    expect(find.text('66.7%'),findsOneWidget); // 2 completed, 1 failed
    expect(find.text('未完整提供'),findsOneWidget); // no fabricated tokens
    await tester.enterText(find.byType(TextField),'000000000002');
    await tester.pumpAndSettle();
    expect(find.text('0.0%'),findsOneWidget);
    expect(find.byTooltip('清除 Owner 篩選'),findsOneWidget);
    await tester.tap(find.byTooltip('清除 Owner 篩選'));
    await tester.pumpAndSettle();
    expect(find.text('66.7%'),findsOneWidget);
  });
}
