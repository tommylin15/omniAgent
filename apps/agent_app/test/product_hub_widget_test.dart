import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omniagent_app/chat_api.dart';
import 'package:omniagent_app/product_hub_page.dart';

const runId='00000000-0000-4000-8000-000000000001';
const profileId='00000000-0000-4000-8000-000000000002';
const actionId='00000000-0000-4000-8000-000000000003';
const digest='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
class HubApi extends ChatApi {
  HubApi():super('fixture');
  bool enabled=true,failCreate=false,failCredential=false;
  final posts=<Map<String,dynamic>>[];
  final puts=<Map<String,dynamic>>[];
  final deletes=<String>[];
  final runs=<Map<String,dynamic>>[];
  final approvals=<Map<String,dynamic>>[];
  Map<String,dynamic> run={'run_id':runId,'status':'blocked','checkpoint':{'steps':1,'toolCalls':0,'tokens':12}};
  @override
  Future<dynamic> get(String path) async {
    if(path=='/v1/me')return {'byokManagementEnabled':enabled};
    if(path=='/v1/capabilities')return {'agentEnabled':enabled,'jobsEnabled':enabled,'workflowKeys':['weekly-plan']};
    if(path.endsWith('/agent-runs'))return {'items':runs};
    if(path=='/v1/agent-runs/$runId')return {...run,'approvals':approvals,'progress':[]};
    if(path=='/v1/credentials')return {'items':[{'profile_id':profileId,'provider':'gemini','status':'ACTIVE'}]};
    if(path=='/v1/credential-rotations')return {'items':[]};
    if(path=='/v1/notifications')return {'items':[{'job_id':runId,'state':'completed'}]};
    if(path=='/v1/jobs')return {'items':[{'id':runId,'state':'queued'}]};
    if(path=='/v1/schedules')return {'items':[{'id':profileId,'enabled':true,'payload':{'workflowKey':'weekly-plan'},'next_run_at':'2026-11-10'}]};
    return {'items':[]};
  }
  @override
  Future<dynamic> post(String path,Map<String,dynamic> body) async {
    posts.add({'path':path,'body':body});
    if(path.endsWith('/agent-runs')){
      runs.add(run);
      if(failCreate)throw StateError('connection lost');
      return run;
    }
    if(path=='/v1/credentials'||path.endsWith('/replace')){
      if(failCredential)throw StateError('never-display-secret-provider-payload');
      return path.endsWith('/replace')?{'operation_id':actionId,'status':'COMPLETED'}:{'profile_id':profileId,'status':'ACTIVE'};
    }
    if(path.endsWith('/approvals')){approvals.clear();return {'status':'approved'};}
    if(path.endsWith('/resume')){run={...run,'status':'queued'};return run;}
    if(path.endsWith('/execute')){run={...run,'status':'completed','result':{'text':'已完成'}};return run;}
    if(path.endsWith('/cancel')){run={...run,'status':'cancelled'};return run;}
    return {'id':actionId,'status':'queued'};
  }
  @override
  Future<dynamic> put(String path,Map<String,dynamic> body) async {puts.add({'path':path,'body':body});return {'status':'updated'};}
  @override
  Future<dynamic> delete(String path) async {deletes.add(path);return {'status':'REVOKED'};}
}
Future<void> open(WidgetTester tester,HubApi api,{String? thread='thread-1'}) async {
  await tester.pumpWidget(MaterialApp(home:ProductHubPage(api,threadId:thread)));
  await tester.pumpAndSettle();
}
void main(){
  testWidgets('disabled capabilities expose no controls that enqueue work',(tester)async{
    final api=HubApi()..enabled=false;await open(tester,api);
    expect(find.text('Agent 尚未啟用或此帳號未獲授權'),findsOneWidget);
    expect(find.text('建立並開始'),findsNothing);expect(api.posts,isEmpty);
    await tester.tap(find.text('API Key'));await tester.pumpAndSettle();
    expect(find.text('API Key 管理尚未啟用'),findsOneWidget);
  });
  testWidgets('an unknown create is recovered from durable list without another create',(tester)async{
    final api=HubApi()..failCreate=true;await open(tester,api);
    await tester.enterText(find.byType(TextField).first,'週末行程');
    await tester.tap(find.text('建立並開始'));await tester.pumpAndSettle();
    expect(api.posts.where((p)=>p['path']=='/v1/threads/thread-1/agent-runs').length,1);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'建立並開始')).onPressed,isNull);
    await tester.tap(find.text('讀回執行紀錄'));await tester.pumpAndSettle();
    expect(find.textContaining('工作：$runId'),findsOneWidget);
    expect(api.posts.where((p)=>(p['path'] as String).endsWith('/execute')),isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('an exact external mutation needs a separate explicit confirmation',(tester)async{
    final api=HubApi();api.runs.add(api.run);
    api.approvals.add({'action_id':actionId,'digest':digest,'status':'pending','tool_name':'calendar.create',
      'input':{'summary':'Private meeting'},'expires_at':DateTime.now().toUtc().add(const Duration(minutes:10)).toIso8601String()});
    await open(tester,api);expect(api.posts,isEmpty);
    final review=find.byTooltip('檢視並確認修改');await tester.ensureVisible(review);await tester.tap(review);await tester.pumpAndSettle();
    expect(find.text('確認外部修改'),findsOneWidget);expect(find.textContaining('Private meeting'),findsWidgets);
    expect(api.posts,isEmpty);
    await tester.tap(find.text('同意此修改'));await tester.pumpAndSettle();
    final approval=api.posts.singleWhere((p)=>(p['path'] as String).endsWith('/approvals'));
    expect(approval['body'],containsPair('actionId',actionId));expect(approval['body'],containsPair('digest',digest));
    expect(api.posts.where((p)=>(p['path'] as String).endsWith('/execute')).length,1);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('credential replacement clears the sensitive input and hides provider errors',(tester)async{
    final api=HubApi()..failCredential=true;await open(tester,api);
    await tester.tap(find.text('API Key'));await tester.pumpAndSettle();
    final replace=find.text('替換金鑰');await tester.ensureVisible(replace);await tester.tap(replace);await tester.pumpAndSettle();
    final input=find.byKey(const ValueKey('credential-key'));await tester.ensureVisible(input);
    await tester.enterText(input,'private-secret-not-for-display');
    final submit=find.text('確認替換');await tester.ensureVisible(submit);await tester.tap(submit);await tester.pumpAndSettle();
    expect(tester.widget<TextField>(input).controller!.text,isEmpty);
    expect(find.textContaining('never-display-secret'),findsNothing);
    expect(find.textContaining('private-secret-not-for-display'),findsNothing);
    expect(api.posts.single['path'],'/v1/credentials/$profileId/replace');
  });
  testWidgets('Groq is an explicit personal credential provider and Codex is excluded',(tester)async{
    final api=HubApi();await open(tester,api);await tester.tap(find.text('API Key'));await tester.pumpAndSettle();
    final providers=find.byType(DropdownButtonFormField<String>);await tester.tap(providers);await tester.pumpAndSettle();
    expect(find.text('Groq'),findsWidgets);expect(find.text('Codex'),findsNothing);
    await tester.tap(find.text('Groq').last);await tester.pumpAndSettle();
    final input=find.byKey(const ValueKey('credential-key'));await tester.enterText(input,'groq-secret-fixture-long-enough');
    await tester.tap(find.text('新增憑證'));await tester.pumpAndSettle();
    expect(api.posts.single['body'],{'provider':'groq','apiKey':'groq-secret-fixture-long-enough'});
  });
  testWidgets('background work uses only registered workflows and notifications can be acknowledged',(tester)async{
    final api=HubApi();await open(tester,api);await tester.tap(find.text('背景工作'));await tester.pumpAndSettle();
    await tester.tap(find.text('建立背景工作'));await tester.pumpAndSettle();
    expect(api.posts.single['body'],{'workflowKey':'weekly-plan'});
    final ack=find.text('已讀');await tester.ensureVisible(ack);await tester.tap(ack);await tester.pumpAndSettle();
    expect(api.posts.last['path'],'/v1/jobs/$runId/acknowledge');
    final toggle=find.byType(SwitchListTile);await tester.ensureVisible(toggle);await tester.tap(toggle);await tester.pumpAndSettle();
    expect(api.puts.single['body'],{'enabled':false});
  });
}
