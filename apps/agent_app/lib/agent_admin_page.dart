import 'package:flutter/material.dart';
import 'chat_api.dart';

/// Admin settings are versioned drafts, never live Gateway instructions.
/// Server-side OAuth/Owner authorization remains mandatory for every request.
class AgentAdminPage extends StatefulWidget {
  const AgentAdminPage(this.api, {super.key});
  final ChatApi api;
  @override
  State<AgentAdminPage> createState() => _AgentAdminPageState();
}

class _AgentAdminPageState extends State<AgentAdminPage> {
  bool loading=true, saving=false;
  String? error;
  int version=0;
  Map<String,dynamic>? settings;
  Map<String,dynamic> effective={};

  @override
  void initState(){super.initState();load();}

  Map<String,dynamic> asMap(dynamic value){
    if(value is! Map)throw const FormatException('設定格式不正確');
    return value.map((k,v)=>MapEntry(k.toString(),v));
  }

  Future<void> load() async {
    setState((){loading=true;error=null;});
    try {
      final body=asMap(await widget.api.get('/v1/admin/agent-settings'));
      if(body['version'] is! int)throw const FormatException('設定版本缺失');
      if(!mounted)return;
      setState((){
        version=body['version'] as int;
        settings=asMap(body['settings']);
        effective=asMap(body['effective']);
        loading=false;
      });
    } catch (_) {
      if(mounted)setState((){
        error='設定無法載入：請確認帳號具有 Admin 權限、API 開關和資料庫 migration。';
        loading=false;
      });
    }
  }

  Map<String,dynamic> section(String name)=>asMap(settings![name]);
  void change(String group,String key,Object value){
    setState((){
      settings![group]={...section(group),key:value};
    });
  }

  Future<void> save() async {
    if(saving||settings==null)return;
    setState((){saving=true;error=null;});
    try {
      final raw=asMap(await widget.api.put('/v1/admin/agent-settings',{
        'expectedVersion':version,'settings':settings!,
      }));
      if(!mounted)return;
      setState((){
        version=raw['version'] as int;
        settings=asMap(raw['settings']);
        effective=asMap(raw['effective']);
        saving=false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('設定草稿已儲存並讀回，不影響正式路由')));
    } catch (_) {
      if(mounted)setState((){
        saving=false;
        error='儲存失敗：可能是版本衝突、參數超界或權限不足。請重新載入核對。';
      });
    }
  }

  Widget numberField(String label,String group,String key,int min,int max){
    final current=section(group)[key] as num?;
    return SizedBox(width:270,child:TextFormField(
      key:ValueKey('$group.$key.$version'),
      initialValue:current?.toString()??'',
      keyboardType:TextInputType.number,
      decoration:InputDecoration(labelText:label,helperText:'限制：$min ～ $max',
        border:const OutlineInputBorder()),
      onChanged:(input){
        final parsed=int.tryParse(input);
        if(parsed!=null)change(group,key,parsed);
      },
    ));
  }

  Widget modelField(String label,String key,List<String> allowed){
    final current=section('models')[key] as String? ?? allowed.first;
    return SizedBox(width:300,child:DropdownButtonFormField<String>(
      value:allowed.contains(current)?current:allowed.first,
      decoration:InputDecoration(labelText:label,border:const OutlineInputBorder()),
      items:[for(final model in allowed)
        DropdownMenuItem(value:model,child:Text(model))],
      onChanged:(model){if(model!=null)change('models',key,model);},
    ));
  }

  Widget flag(String group,String key,String title,String description)=>
      SwitchListTile.adaptive(
        title:Text(title),subtitle:Text(description),
        value:section(group)[key]==true,
        onChanged:(value)=>change(group,key,value),
      );

  Widget panel(String title,List<Widget> children)=>Card(
    child:Padding(padding:const EdgeInsets.all(16),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:Theme.of(context).textTheme.titleLarge),
        const SizedBox(height:14),...children,
      ],
    )),
  );

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Agent 管理設定'),actions:[
      IconButton(tooltip:'重新讀取伺服器設定',onPressed:saving?null:load,
        icon:const Icon(Icons.refresh)),
    ]),
    body:loading?const Center(child:CircularProgressIndicator()):
      settings==null?Center(child:Padding(padding:const EdgeInsets.all(24),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          Text(error??'設定不可用'),const SizedBox(height:16),
          OutlinedButton(onPressed:load,child:const Text('重新讀取')),
        ]))):
      ListView(padding:const EdgeInsets.all(16),children:[
        Card(child:Padding(padding:const EdgeInsets.all(16),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('指定 Admin 專用 · 僅設定草稿',
              style:Theme.of(context).textTheme.titleMedium),
            const SizedBox(height:6),
            const Text('此頁不直接修改 API Key、Cloud Run、IAM 或正式模型。'
              '管理員設定仍必須通過部署和 runtime 驗收才可生效。'),
            const SizedBox(height:8),
            Text('版本：$version；狀態：'+(effective['activation']??'未核實').toString()),
            Text('付費路由：'+(effective['paidRoutingEnabled']==true?'啟用':'未啟用')+
              '；Agent：'+(effective['agentExecutionEnabled']==true?'啟用':'未啟用')),
            const Text('API Key 只允許後端驗證配置狀態；不提供金鑰明文。'),
          ]))),
        panel('模型路由（尚未套用正式 Gateway）',[
          Wrap(spacing:12,runSpacing:14,children:[
            modelField('公開任務 · Lite','publicLite',const [
              'gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite']),
            modelField('私人任務 · Paid Lite','privateLite',const [
              'gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite']),
            modelField('複雜分析 · Paid Flash','advancedFlash',const [
              'gemini-3.8-flash']),
          ]),
          const SizedBox(height:12),
          flag('controls','requestPaidRouting','申請付費模型路由',
            '只保存意向；正式付費開關仍為 OFF。'),
        ]),
        panel('模型呼叫、Token 與成本限制',[
          Wrap(spacing:12,runSpacing:14,children:[
            numberField('Owner 每日呼叫上限','limits','ownerDailyCalls',1,200),
            numberField('全域每日呼叫上限','limits','globalDailyCalls',1,1000),
            numberField('Owner 每日 Tokens','limits','ownerDailyTokens',1000,1000000),
            numberField('全域每日 Tokens','limits','globalDailyTokens',1000,5000000),
            numberField('每月預算（美分）','limits','monthlyBudgetUsdCents',100,100000),
          ]),
          const SizedBox(height:8),
          const Text('美元抵免額不是 API hard cap。用量和費用未知時必須標示未核實。'),
        ]),
        panel('Agent Loop 限制',[
          Wrap(spacing:12,runSpacing:14,children:[
            numberField('最大推理步數','agent','maxSteps',1,16),
            numberField('最大工具呼叫','agent','maxToolCalls',1,32),
            numberField('最多執行秒數','agent','timeoutSeconds',10,600),
            numberField('最大工具結果 Bytes','agent','maxToolOutputBytes',1024,65536),
          ]),
          const SizedBox(height:8),
          flag('controls','requestAgentExecution','申請啟用 Agent Loop',
            '不會直接啟動 Worker，也不解除 Chat Dispatch 原有安全 Gate。'),
        ]),
        panel('跨系統工具：需各自授權才可連接',[
          flag('tools','life','Life 活動','Owner-safe Connector 尚待整合'),
          flag('tools','janus','Janus 持股','必須本人 OAuth MCP Scope'),
          flag('tools','calendar','Google Calendar','必須另外授權 Google Calendar'),
          flag('tools','drive','Google Drive','只可查詢獲授權的資源'),
        ]),
        panel('安全審批',[
          flag('controls','requireWriteApproval','L2 寫入必須使用者確認',
            '安全政策強制保持開啟；關閉會被後端拒絕。'),
          const Text('L3 金融交易、批量刪除、部署、IAM 及 Secret 改動，'
            '禁止由一般聊天 Agent 自動執行。'),
        ]),
        if(error!=null)Padding(padding:const EdgeInsets.all(8),
          child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
        const SizedBox(height:12),
        FilledButton.icon(onPressed:saving?null:save,
          icon:const Icon(Icons.save_outlined),
          label:Text(saving?'儲存中…':'儲存草稿')),
        const SizedBox(height:28),
      ]),
  );
}