import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omniagent_app/agent_admin_page.dart';
import 'package:omniagent_app/chat_api.dart';

class FakeAgentAdminApi extends ChatApi {
  FakeAgentAdminApi({this.denied=false}) : super('fixture-only');
  final bool denied;
  int writes=0;
  Map<String,dynamic>? lastBody;

  Map<String,dynamic> draft(int version)=>({
    'version':version,
    'settings':{
      'models':{
        'publicLite':'gemini-3.5-flash-lite',
        'privateLite':'gemini-3.5-flash-lite',
        'advancedFlash':'gemini-3.8-flash',
      },
      'limits':{
        'ownerDailyCalls':20,'globalDailyCalls':100,
        'ownerDailyTokens':100000,'globalDailyTokens':500000,
        'monthlyBudgetUsdCents':1000,
      },
      'agent':{
        'maxSteps':4,'maxToolCalls':8,
        'timeoutSeconds':90,'maxToolOutputBytes':16384,
      },
      'controls':{
        'requestPaidRouting':false,'requestAgentExecution':false,
        'requireWriteApproval':true,
      },
      'tools':{'life':false,'janus':false,'calendar':false,'drive':false},
    },
    'effective':{
      'activation':'draft_only','paidRoutingEnabled':false,
      'agentExecutionEnabled':false,'toolsConnected':false,
      'secrets':'not_disclosed','runtimeVerification':'not_verified',
    },
  });

  @override
  Future<dynamic> get(String path) async {
    if(denied)throw StateError('forbidden');
    if(path!='/v1/admin/agent-settings')throw StateError('unexpected path');
    return draft(0);
  }
  @override
  Future<dynamic> put(String path,Map<String,dynamic> body) async {
    if(denied)throw StateError('forbidden');
    if(path!='/v1/admin/agent-settings')throw StateError('unexpected path');
    lastBody=body;
    writes++;
    return draft(1);
  }
}

void main(){
  testWidgets('Admin console shows draft/effective distinction and saves versioned settings',
    (tester)async{
      await tester.binding.setSurfaceSize(const Size(960,1100));
      addTearDown(()=>tester.binding.setSurfaceSize(null));
      final api=FakeAgentAdminApi();
      await tester.pumpWidget(MaterialApp(home:AgentAdminPage(api)));
      await tester.pumpAndSettle();
      expect(find.text('指定 Admin 專用 · 僅設定草稿'),findsOneWidget);
      expect(find.text('付費路由：未啟用；Agent：未啟用'),findsOneWidget);
      expect(find.text('API Key 只允許後端驗證配置狀態；不提供金鑰明文。'),
        findsOneWidget);
      await tester.scrollUntilVisible(find.text('儲存草稿'),400,
        scrollable:find.byType(Scrollable).first);
      await tester.tap(find.text('儲存草稿'));
      await tester.pumpAndSettle();
      expect(api.writes,1);
      expect(api.lastBody?['expectedVersion'],0);
      expect((api.lastBody?['settings'] as Map)['controls']['requireWriteApproval'],true);
      expect(find.text('設定草稿已儲存並讀回，不影響正式路由'),findsOneWidget);
    });
  testWidgets('Denied Admin API never shows settings',
    (tester)async{
      await tester.pumpWidget(MaterialApp(home:AgentAdminPage(
        FakeAgentAdminApi(denied:true))));
      await tester.pumpAndSettle();
      expect(find.textContaining('設定無法載入'),findsOneWidget);
      expect(find.text('儲存草稿'),findsNothing);
    });
}