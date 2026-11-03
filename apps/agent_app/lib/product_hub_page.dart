import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'chat_api.dart';

Map<String,dynamic> _map(dynamic value) => value is Map
    ? value.map((k,v)=>MapEntry(k.toString(),v)) : <String,dynamic>{};
List<Map<String,dynamic>> _items(dynamic value) =>
    (_map(value)['items'] as List? ?? []).map(_map).toList();

class ProductHubPage extends StatefulWidget {
  const ProductHubPage(this.api,{super.key,this.threadId});
  final ChatApi api;
  final String? threadId;
  @override
  State<ProductHubPage> createState()=>_ProductHubPageState();
}
class _ProductHubPageState extends State<ProductHubPage> {
  Map<String,dynamic>? capabilities;
  String? error;
  bool credentials=false;
  @override
  void initState(){super.initState();load();}
  Future<void> load() async {
    setState((){error=null;capabilities=null;});
    try {
      final values=await Future.wait([widget.api.get('/v1/capabilities'),widget.api.get('/v1/me')]);
      if(mounted)setState((){capabilities=_map(values[0]);credentials=_map(values[1])['byokManagementEnabled']==true;});
    }catch(_){if(mounted)setState(()=>error='功能狀態無法載入，請重新整理。');}
  }
  @override
  Widget build(BuildContext context)=>DefaultTabController(length:3,child:Scaffold(
    appBar:AppBar(title:const Text('工作與帳號'),bottom:const TabBar(tabs:[
      Tab(text:'Agent'),Tab(text:'背景工作'),Tab(text:'API Key')]),actions:[
      IconButton(onPressed:load,tooltip:'重新載入功能',icon:const Icon(Icons.refresh))]),
    body:error!=null?Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Text(error!),
      TextButton(onPressed:load,child:const Text('重試'))])):
      capabilities==null?const Center(child:CircularProgressIndicator()):TabBarView(children:[
        capabilities!['agentEnabled']==true?_AgentPanel(widget.api,widget.threadId):const Center(child:Text('Agent 尚未啟用或此帳號未獲授權')),
        capabilities!['jobsEnabled']==true?_JobsPanel(widget.api,
          (capabilities!['workflowKeys'] as List? ?? []).whereType<String>().toList()):const Center(child:Text('背景工作尚未啟用')),
        credentials?_CredentialPanel(widget.api):const Center(child:Text('API Key 管理尚未啟用')),
      ]),
  ));
}

class _AgentPanel extends StatefulWidget {
  const _AgentPanel(this.api,this.threadId);
  final ChatApi api;final String? threadId;
  @override
  State<_AgentPanel> createState()=>_AgentPanelState();
}
class _AgentPanelState extends State<_AgentPanel> {
  final prompt=TextEditingController();
  List<Map<String,dynamic>> runs=[];
  Map<String,dynamic>? run;
  String? error;
  bool busy=false,uncertainCreate=false,polling=false,dispatching=false;
  Timer? timer;
  @override
  void initState(){super.initState();refreshList();}
  @override
  void dispose(){timer?.cancel();prompt.dispose();super.dispose();}
  String? get runId=>run?['run_id'] as String?;
  Future<void> refreshList() async {
    if(widget.threadId==null)return;
    try {
      final items=_items(await widget.api.get('/v1/threads/${Uri.encodeComponent(widget.threadId!)}/agent-runs'));
      if(!mounted)return;
      setState(()=>runs=items);
      if(runId!=null){await read();}else if(items.isNotEmpty){await select(items.first);}
    }catch(_){if(mounted)setState(()=>error='執行紀錄讀取失敗；請重新讀回，勿重複建立工作。');}
  }
  Future<void> select(Map<String,dynamic> value) async {
    timer?.cancel();setState(()=>run=value);await read();
  }
  Future<void> read() async {
    final id=runId;if(id==null||polling)return;
    polling=true;
    try {
      final value=_map(await widget.api.get('/v1/agent-runs/$id'));
      if(!mounted||runId!=id)return;
      setState(()=>run=value);
      timer?.cancel();
      if(['queued','running'].contains(value['status'])){
        timer=Timer(const Duration(seconds:2),read);
      }
    }catch(_){if(mounted)setState(()=>error='執行狀態暫時未知；請讀回原工作，不要重新建立。');}
    finally{polling=false;if(mounted&&runId!=id)unawaited(read());}
  }
  Future<void> start() async {
    if(busy||uncertainCreate||widget.threadId==null||prompt.text.trim().isEmpty)return;
    setState((){busy=true;error=null;});
    try {
      final value=_map(await widget.api.post('/v1/threads/${Uri.encodeComponent(widget.threadId!)}/agent-runs',{'content':prompt.text.trim()}));
      if(value['run_id'] is! String)throw const FormatException('missing run');
      if(!mounted)return;
      setState(()=>run=value);prompt.clear();
      unawaited(execute());await refreshList();
    }catch(_){if(mounted)setState((){uncertainCreate=true;error='建立結果未知。已停止新增；請重新讀回既有紀錄，確認後再操作。';});}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> execute() async {
    final id=runId;if(id==null||dispatching)return;
    if(mounted)setState(()=>dispatching=true);
    timer?.cancel();timer=Timer(const Duration(milliseconds:500),read);
    try{await widget.api.post('/v1/agent-runs/$id/execute',{});}
    catch(_){if(mounted)setState(()=>error='工作派送結果未知，正在讀回原工作。');}
    finally{if(mounted){setState(()=>dispatching=false);await read();}}
  }
  Future<void> action(String operation) async {
    final id=runId;if(id==null||busy)return;
    setState((){busy=true;error=null;});
    try {
      await widget.api.post('/v1/agent-runs/$id/$operation',{});
      if(operation=='resume')unawaited(execute());
      await read();
    }catch(_){if(mounted)setState(()=>error='操作未能確認。請讀回原工作；不明外部結果須先核對。');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> approve(Map<String,dynamic> approval) async {
    final expiry=DateTime.tryParse('${approval['expires_at']}');
    if(expiry==null||!expiry.isAfter(DateTime.now())){setState(()=>error='此確認已過期，請取消或核對原工作。');return;}
    final yes=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(
      title:const Text('確認外部修改'),content:SingleChildScrollView(child:Column(crossAxisAlignment:CrossAxisAlignment.start,
        mainAxisSize:MainAxisSize.min,children:[Text('${approval['tool_name']}'),
          SelectableText(const JsonEncoder.withIndent('  ').convert(approval['input'])),
          Text('有效期限：${expiry.toLocal()}'),const Text('只有此工具及上述參數會獲得授權。') ])),
      actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('返回')),
        FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('同意此修改'))]));
    if(yes!=true||!mounted||runId==null)return;
    setState(()=>busy=true);
    try{await widget.api.post('/v1/agent-runs/$runId/approvals',{
      'actionId':approval['action_id'],'digest':approval['digest'],'expiresAt':approval['expires_at']});
      await widget.api.post('/v1/agent-runs/$runId/resume',{});unawaited(execute());await read();
    }catch(_){if(mounted)setState(()=>error='修改授權未確認，請讀回審批狀態；不會重新建立修改。');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override
  Widget build(BuildContext context){
    if(widget.threadId==null)return const Center(child:Text('請先開啟一個對話，再建立 Agent 工作'));
    final approvals=(run?['approvals'] as List? ?? []).map(_map).where((a)=>a['status']=='pending');
    final checkpoint=_map(run?['checkpoint']);
    return ListView(padding:const EdgeInsets.all(16),children:[
      const Text('Agent 工作',style:TextStyle(fontSize:20)),
      if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
      TextField(controller:prompt,enabled:!busy&&!uncertainCreate,maxLength:2000,minLines:2,maxLines:5,
        decoration:const InputDecoration(labelText:'想完成的工作',border:OutlineInputBorder())),
      Wrap(spacing:8,children:[FilledButton(onPressed:busy||uncertainCreate?null:start,child:const Text('建立並開始')),
        OutlinedButton(onPressed:refreshList,child:const Text('讀回執行紀錄'))]),
      if(runs.isNotEmpty)DropdownButtonFormField<String>(key:ValueKey('runs-${runs.length}-$runId'),
        initialValue:runs.any((r)=>r['run_id']==runId)?runId:null,isExpanded:true,
        decoration:const InputDecoration(labelText:'既有工作'),items:[for(final r in runs)
          DropdownMenuItem(value:'${r['run_id']}',child:Text('${r['status']} · ${r['run_id']}',overflow:TextOverflow.ellipsis))],
        onChanged:(id){final selected=runs.where((r)=>r['run_id']==id);if(selected.isNotEmpty)select(selected.first);}),
      if(run!=null)...[
        SelectableText('工作：$runId\n狀態：${run!['status']}'),
        Text('決策：${checkpoint['steps']??'未知'} · 工具：${checkpoint['toolCalls']??'未知'} · Tokens：${checkpoint['tokens']??'未知'}'),
        if(_map(run!['result'])['text'] is String)SelectableText(_map(run!['result'])['text'] as String),
        Wrap(spacing:8,children:[TextButton(onPressed:busy?null:read,child:const Text('重新讀回')),
          if(run!['status']=='queued')TextButton(onPressed:busy||dispatching?null:execute,child:const Text('開始原工作')),
          TextButton(onPressed:busy||!['queued','running','blocked'].contains(run!['status'])?null:()=>action('cancel'),child:const Text('停止')),
          TextButton(onPressed:busy||!['cancelled','blocked','failed'].contains(run!['status'])?null:()=>action('resume'),child:const Text('續跑原工作'))]),
        for(final approval in approvals)Card(child:ListTile(title:Text('待確認：${approval['tool_name']}'),
          subtitle:Text(const JsonEncoder.withIndent('  ').convert(approval['input'])),isThreeLine:false,
          trailing:IconButton(tooltip:'檢視並確認修改',onPressed:busy?null:()=>approve(approval),icon:const Icon(Icons.fact_check)))),
        if((run!['progress'] as List? ?? []).isNotEmpty)ExpansionTile(title:const Text('執行進度'),children:[
          for(final step in (run!['progress'] as List).map(_map))ListTile(dense:true,
            title:Text('步驟 ${_map(step['checkpoint'])['steps']} · ${_map(step['checkpoint'])['phase']}'),
            subtitle:Text('${step['recorded_at']}'))]),
      ],
    ]);
  }
}

class _CredentialPanel extends StatefulWidget {
  const _CredentialPanel(this.api);final ChatApi api;
  @override
  State<_CredentialPanel> createState()=>_CredentialPanelState();
}
class _CredentialPanelState extends State<_CredentialPanel> {
  final keyInput=TextEditingController();
  List<Map<String,dynamic>> profiles=[],rotations=[];
  String provider='gemini';String? replaceId,error;
  bool busy=false,uncertain=false;
  @override
  void initState(){super.initState();load();}
  @override
  void dispose(){keyInput.clear();keyInput.dispose();super.dispose();}
  Future<void> load() async {
    try{
      final values=await Future.wait([widget.api.get('/v1/credentials'),widget.api.get('/v1/credential-rotations')]);
      if(mounted)setState((){profiles=_items(values[0]);rotations=_items(values[1]);});
    }catch(_){if(mounted)setState(()=>error='憑證狀態讀取失敗，請重新讀回。');}
  }
  Future<void> save() async {
    if(busy||uncertain||keyInput.text.isEmpty)return;
    final secret=keyInput.text;keyInput.clear();
    setState((){busy=true;error=null;});
    try{
      if(replaceId==null){await widget.api.post('/v1/credentials',{'provider':provider,'apiKey':secret});}
      else{await widget.api.post('/v1/credentials/$replaceId/replace',{'apiKey':secret});}
      if(mounted)setState(()=>replaceId=null);await load();
    }catch(_){if(mounted)setState((){uncertain=true;error='提交結果未知；金鑰輸入已清除。請讀回憑證與替換紀錄，再核對或撤銷。';});}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> revoke(Map<String,dynamic> profile) async {
    final yes=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:const Text('撤銷此 API Key？'),
      content:const Text('使用此設定的對話將無法繼續使用該憑證。'),actions:[
        TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('返回')),
        FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('撤銷'))]));
    if(yes!=true||!mounted)return;
    setState(()=>busy=true);
    try{await widget.api.delete('/v1/credentials/${profile['profile_id']}');await load();}
    catch(_){if(mounted)setState(()=>error='撤銷未確認，請讀回原憑證狀態。');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> reconcile(Map<String,dynamic> rotation) async {
    setState(()=>busy=true);
    try{await widget.api.post('/v1/credential-rotations/${rotation['operation_id']}/reconcile',{});await load();}
    catch(_){if(mounted)setState(()=>error='外部憑證仍無法核對；原有效憑證不會因核對而直接刪除。');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override
  Widget build(BuildContext context)=>ListView(padding:const EdgeInsets.all(16),children:[
    const Text('個人 API Key',style:TextStyle(fontSize:20)),
    const Text('金鑰只供此帳號的指定模型使用；清單只顯示設定與狀態。'),
    if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
    DropdownButtonFormField<String>(key:ValueKey('provider-$provider-$replaceId'),initialValue:provider,decoration:const InputDecoration(labelText:'服務'),
      items:const [DropdownMenuItem(value:'gemini',child:Text('Gemini')),DropdownMenuItem(value:'openrouter',child:Text('OpenRouter')),
        DropdownMenuItem(value:'groq',child:Text('Groq'))],
      onChanged:busy||replaceId!=null?null:(v)=>setState(()=>provider=v!)),
    TextField(key:const ValueKey('credential-key'),controller:keyInput,obscureText:true,enableSuggestions:false,
      autocorrect:false,enableIMEPersonalizedLearning:false,enabled:!busy&&!uncertain,decoration:InputDecoration(labelText:replaceId==null?'新增 API Key':'替換 API Key',
        helperText:'送出後立即清除輸入；不顯示已儲存金鑰')),
    Wrap(spacing:8,children:[FilledButton(onPressed:busy||uncertain?null:save,child:Text(replaceId==null?'新增憑證':'確認替換')),
      TextButton(onPressed:load,child:const Text('讀回憑證狀態')),
      if(replaceId!=null)TextButton(onPressed:busy?null:(){keyInput.clear();setState(()=>replaceId=null);},child:const Text('取消替換'))]),
    for(final p in profiles)Card(child:Column(children:[ListTile(title:Text('${p['provider']} · ${p['status']}'),
      subtitle:SelectableText('${p['profile_id']}')),Wrap(spacing:8,children:[
        TextButton(onPressed:busy||uncertain||p['status']!='ACTIVE'?null:(){keyInput.clear();setState((){
          replaceId='${p['profile_id']}';provider='${p['provider']}';});},child:const Text('替換金鑰')),
        TextButton(onPressed:busy||p['status']=='REVOKED'?null:()=>revoke(p),child:const Text('撤銷憑證'))])])),
    if(rotations.isNotEmpty)const Text('替換與復原紀錄'),
    for(final r in rotations)ListTile(title:Text('${r['status']}'),subtitle:Text('${r['operation_id']}'),
      trailing:['COMPLETED','ROLLED_BACK'].contains(r['status'])?null:TextButton(onPressed:busy?null:()=>reconcile(r),child:const Text('核對復原'))),
  ]);
}

class _JobsPanel extends StatefulWidget {
  const _JobsPanel(this.api,this.workflows);final ChatApi api;final List<String> workflows;
  @override
  State<_JobsPanel> createState()=>_JobsPanelState();
}
class _JobsPanelState extends State<_JobsPanel> {
  List<Map<String,dynamic>> jobs=[],schedules=[],notifications=[];
  String? workflow,error;bool busy=false,uncertain=false;
  @override
  void initState(){super.initState();workflow=widget.workflows.isEmpty?null:widget.workflows.first;load();}
  Future<void> load() async {
    try{final values=await Future.wait([widget.api.get('/v1/jobs'),widget.api.get('/v1/schedules'),widget.api.get('/v1/notifications')]);
      if(mounted)setState((){jobs=_items(values[0]);schedules=_items(values[1]);notifications=_items(values[2]);});
    }catch(_){if(mounted)setState(()=>error='背景工作狀態無法載入，請重新讀回。');}
  }
  Future<void> mutate(Future<dynamic> Function() operation,{bool creates=false}) async {
    if(busy)return;setState((){busy=true;error=null;});
    try{await operation();await load();}
    catch(_){if(mounted)setState((){if(creates)uncertain=true;error='操作結果未確認，請讀回原工作或排程。';});}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> details(Map<String,dynamic> job) async {
    try{final value=_map(await widget.api.get('/v1/jobs/${job['id']}'));
      if(!mounted)return;await showDialog<void>(context:context,builder:(c)=>AlertDialog(
        title:Text('工作 ${value['state']}'),content:SingleChildScrollView(child:SelectableText(
          const JsonEncoder.withIndent('  ').convert(value['result']??{'state':value['state']}))),
        actions:[TextButton(onPressed:()=>Navigator.pop(c),child:const Text('關閉'))]));
    }catch(_){if(mounted)setState(()=>error='此工作讀回失敗。');}
  }
  @override
  Widget build(BuildContext context)=>ListView(padding:const EdgeInsets.all(16),children:[
    const Text('背景工作與通知',style:TextStyle(fontSize:20)),
    if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
    if(widget.workflows.isEmpty)const Text('尚無此帳號可執行的工作流程')
    else DropdownButtonFormField<String>(initialValue:workflow,isExpanded:true,
      decoration:const InputDecoration(labelText:'已授權工作流程'),items:[for(final k in widget.workflows)DropdownMenuItem(value:k,child:Text(k))],
      onChanged:busy?null:(v)=>setState(()=>workflow=v)),
    Wrap(spacing:8,children:[FilledButton(onPressed:busy||uncertain||workflow==null?null:()=>mutate(
      ()=>widget.api.post('/v1/jobs',{'workflowKey':workflow}),creates:true),child:const Text('建立背景工作')),
      OutlinedButton(onPressed:busy||uncertain||workflow==null?null:()=>mutate(()=>widget.api.post('/v1/schedules',{
        'workflowKey':workflow,'intervalSeconds':604800,'nextRunAt':DateTime.now().toUtc().add(const Duration(days:7)).toIso8601String()}),
        creates:true),child:const Text('建立每週排程')),
      TextButton(onPressed:load,child:const Text('重新讀回工作'))]),
    for(final n in notifications)Card(child:ListTile(title:Text('通知：${n['state']}'),subtitle:Text('${n['job_id']}'),
      trailing:TextButton(onPressed:busy?null:()=>mutate(()=>widget.api.post('/v1/jobs/${n['job_id']}/acknowledge',{})),child:const Text('已讀')))),
    for(final j in jobs)ListTile(title:Text('工作：${j['state']}'),subtitle:Text('${j['id']}'),onTap:()=>details(j),
      trailing:['queued','running'].contains(j['state'])?TextButton(onPressed:busy?null:()=>mutate(
        ()=>widget.api.post('/v1/jobs/${j['id']}/cancel',{})),child:const Text('停止工作')):null),
    if(schedules.isNotEmpty)const Text('排程（每週；首次於建立後七日）'),
    for(final s in schedules)SwitchListTile(title:Text('${_map(s['payload'])['workflowKey']??'工作排程'}'),
      subtitle:Text('下次：${s['next_run_at']}'),value:s['enabled']==true,onChanged:busy?null:(enabled)=>mutate(
        ()=>widget.api.put('/v1/schedules/${s['id']}',{'enabled':enabled}))),
  ]);
}
