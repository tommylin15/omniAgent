import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'chat_api.dart';
import 'omni_theme.dart';

/// An authenticated, read-only administrative view. The backend performs the
/// real authorization check; this page never sends an owner ID as authority.
/// Chat turns and verified shared Gateway calls are deliberately not summed.
class RouterUsagePage extends StatefulWidget {
  const RouterUsagePage(this.api, {super.key});
  final ChatApi api;
  @override
  State<RouterUsagePage> createState() => _RouterUsagePageState();
}

class _RouterUsagePageState extends State<RouterUsagePage> {
  int days = 7;
  String project = 'all';
  String provider = 'all';
  String status = 'all';
  String ownerQuery = '';
  final ownerController = TextEditingController();
  late Future<dynamic> report = load();

  @override
  void dispose() {
    ownerController.dispose();
    super.dispose();
  }

  Future<dynamic> load() => widget.api.get('/v1/admin/router-usage?days=$days');

  void reload() => setState(() { report = load(); });

  static String number(num n) {
    final digits=n.toInt().toString().split('');
    final out=<String>[];
    for(var i=0;i<digits.length;i++) {
      if(i>0 && (digits.length-i)%3==0)out.add(',');
      out.add(digits[i]);
    }
    return out.join();
  }

  List<Map<String,dynamic>> items(dynamic value) {
    if(value is! Map || value['rows'] is! List)return [];
    return (value['rows'] as List).whereType<Map>()
        .map((x)=>x.map((key,value)=>MapEntry(key.toString(),value))).toList();
  }

  int calls(Iterable<Map<String,dynamic>> rows) =>
      rows.fold(0,(n,r)=>n+((r['calls'] as num?)?.toInt()??0));

  String tokens(Iterable<Map<String,dynamic>> rows) {
    final values=rows.toList();
    if(values.isEmpty)return '—';
    if(values.any((r)=>r['tokens'] is! num))return '未完整提供';
    return number(values.fold<int>(0,(sum,r)=>sum+(r['tokens'] as num).toInt()));
  }

  static String safeCell(Object? input) {
    var s=(input??'').toString();
    if(RegExp(r'^[=+@-]').hasMatch(s))s="'$s";
    return '"${s.replaceAll('"','""')}"';
  }

  Future<void> export(List<Map<String,dynamic>> rows) async {
    final columns=['source','day','project','ownerId','provider','model','status','calls','tokens'];
    final csv=<String>[columns.join(',')];
    for(final row in rows) {
      csv.add(columns.map((k)=>safeCell(row[k])).join(','));
    }
    await Clipboard.setData(ClipboardData(text:csv.join('\r\n')));
    if(mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('已複製目前篩選結果的 CSV')));
    }
  }

  Widget stat(String title,String value,String note) => Container(
    width:190,padding:const EdgeInsets.all(16),
    decoration:BoxDecoration(
      color:OmniColors.softSurface,
      borderRadius:BorderRadius.circular(18),
      border:Border.all(color:OmniColors.milkTea)),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(title,style:const TextStyle(fontSize:12)),
      const SizedBox(height:8),
      Text(value,style:const TextStyle(fontSize:23,fontWeight:FontWeight.w700)),
      Text(note,style:const TextStyle(fontSize:11)),
    ]),
  );

  Widget dropdown(String label,String current,List<String> options,
      ValueChanged<String> change) {
    return SizedBox(width:178,child:InputDecorator(
      decoration:InputDecoration(labelText:label,isDense:true,
        border:OutlineInputBorder(borderRadius:BorderRadius.circular(12))),
      child:DropdownButtonHideUnderline(child:DropdownButton<String>(
        value:options.contains(current)?current:'all',isExpanded:true,
        isDense:true,items:options.map((s)=>DropdownMenuItem(
          value:s,child:Text(s=='all'?'全部':s,overflow:TextOverflow.ellipsis)
        )).toList(),onChanged:(v){if(v!=null)change(v);}
      )),
    ));
  }

  Widget breakdown(String label,List<Map<String,dynamic>> rows) {
    if(rows.isEmpty) {
      return Padding(
        padding:const EdgeInsets.symmetric(vertical:12),child:Text('$label：沒有符合的紀錄'));
    }
    final grouped=<String,int>{};
    for(final row in rows) {
      final key='${row['provider']} / ${row['model']}';
      grouped[key]=(grouped[key]??0)+((row['calls'] as num?)?.toInt()??0);
    }
    final entries=grouped.entries.toList()..sort((a,b)=>b.value.compareTo(a.value));
    final peak=entries.first.value;
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(label,style:Theme.of(context).textTheme.titleMedium),
      const SizedBox(height:8),
      for(final entry in entries.take(10)) Padding(
        padding:const EdgeInsets.symmetric(vertical:5),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[
            Expanded(child:Text(entry.key,maxLines:1,overflow:TextOverflow.ellipsis)),
            Text(number(entry.value),style:const TextStyle(fontWeight:FontWeight.bold))
          ]),
          const SizedBox(height:3),
          ClipRRect(borderRadius:BorderRadius.circular(6),
            child:LinearProgressIndicator(value:peak==0?0:entry.value/peak,minHeight:7)),
        ])),
      const SizedBox(height:12),
    ]);
  }


  /// Separate provider invocations from Chat turns: an Owner may appear in
  /// both sources, but their counts must never be added as if one metric.
  Widget ownerRanking(String label,List<Map<String,dynamic>> rows) {
    final counts=<String,int>{};
    for(final row in rows) {
      final key="${row['project']}|${row['ownerId']}";
      counts[key]=(counts[key]??0)+((row['calls'] as num?)?.toInt()??0);
    }
    final ordered=counts.entries.toList()..sort((a,b)=>b.value.compareTo(a.value));
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(label,style:Theme.of(context).textTheme.titleMedium),
      const SizedBox(height:6),
      if(ordered.isEmpty) const Text('目前無符合紀錄'),
      for(final item in ordered.take(10)) ListTile(
        dense:true,
        contentPadding:EdgeInsets.zero,
        title:Text(item.key.replaceFirst('|',' · '),
          maxLines:1,overflow:TextOverflow.ellipsis),
        trailing:Text('${number(item.value)} 次'),
        onTap:(){
          final parts=item.key.split('|');
          ownerController.text=parts.last;
          setState((){
            project=parts.first;
            ownerQuery=parts.last;
          });
        },
      ),
      const SizedBox(height:12),
    ]);
  }

  Widget content(dynamic data) {
    final all=items(data);
    final projects=<String>{'all',...all.map((r)=>'${r['project']}')}.toList()..sort();
    final providers=<String>{'all',...all.map((r)=>'${r['provider']}')}.toList()..sort();
    final statuses=<String>{'all',...all.map((r)=>'${r['status']}')}.toList()..sort();
    final filtered=all.where((r)=>
      (project=='all'||r['project']==project) &&
      (provider=='all'||r['provider']==provider) &&
      (status=='all'||r['status']==status) &&
      (ownerQuery.isEmpty||'${r['ownerId']}'.toLowerCase().contains(ownerQuery.toLowerCase()))
    ).toList();
    final gateway=filtered.where((r)=>r['source']=='shared_gemini').toList();
    final chat=filtered.where((r)=>r['source']=='chat_turns').toList();
    final sources=data is Map?data['sources']:null;
    final sourceState=sources is Map?sources['sharedGemini']:'unknown';
    final owners=filtered.map((r)=>"${r['project']}:${r['ownerId']}").toSet().length;
    final settled=filtered.where((r)=>r['source']=='shared_gemini' &&
        (r['status']=='completed'||r['status']=='failed')).toList();
    final success=calls(settled.where((r)=>r['status']=='completed'));
    final settledCalls=calls(settled);
    return ListView(padding:const EdgeInsets.all(16),children:[
      Text('AI Router 戰情室',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:4),
      Text('UTC 統計日｜資料讀取時間：${data is Map?data['generatedAt']??'—':'—'}',
        style:Theme.of(context).textTheme.bodySmall),
      const SizedBox(height:16),
      Wrap(spacing:10,runSpacing:10,children:[
        dropdown('專案',project,projects,(v)=>setState(()=>project=v)),
        dropdown('AI',provider,providers,(v)=>setState(()=>provider=v)),
        dropdown('狀態',status,statuses,(v)=>setState(()=>status=v)),
        SizedBox(width:210,child:TextField(
          controller:ownerController,
          decoration:InputDecoration(labelText:'搜尋 Owner UUID',
            prefixIcon:const Icon(Icons.search),isDense:true,
            suffixIcon:ownerQuery.isEmpty?null:IconButton(
              tooltip:'清除 Owner 篩選',
              onPressed:()=>setState((){
                ownerController.clear();
                ownerQuery='';
              }),
              icon:const Icon(Icons.close)),
            border:const OutlineInputBorder()),
          onChanged:(v)=>setState(()=>ownerQuery=v.trim()),
        )),
      ]),
      const SizedBox(height:16),
      Wrap(spacing:12,runSpacing:12,children:[
        stat('Gateway 請求',number(calls(gateway)),'Gemini 去重 request ID'),
        stat('Chat 對話回合',number(calls(chat)),'不可等同實際 API 呼叫'),
        stat('活躍 Owner',number(owners),'依專案＋Owner 去重'),
        stat('Gateway Tokens',tokens(gateway),'缺一筆即標示未完整提供'),
        stat('Gateway 成功率',settledCalls==0?'—':
          '${(success*100/settledCalls).toStringAsFixed(1)}%',
          '僅計已結算 completed／failed'),
      ]),
      const SizedBox(height:16),
      if(sourceState!='available') Text(
        '資料覆蓋提醒：Gateway 帳本 ${sourceState=='not_configured'?'尚未設定唯讀連線':'目前不可讀'}；不可視為零次呼叫。',
        style:TextStyle(color:Theme.of(context).colorScheme.error)),
      if(data is Map && data['truncated']==true)
        Text('資料量超過查詢上限：此畫面不是完整統計，請縮小查詢範圍。',
          style:TextStyle(color:Theme.of(context).colorScheme.error)),
      const SizedBox(height:20),
      breakdown('Gateway 實際執行紀錄（獨立計數）',gateway),
      breakdown('Chat 回合紀錄（獨立計數）',chat),
      ownerRanking('Gateway Owner 使用排行（請求次數）',gateway),
      ownerRanking('Chat Owner 使用排行（回合次數）',chat),
      Row(children:[
        Text('明細',style:Theme.of(context).textTheme.titleMedium),
        const Spacer(),
        OutlinedButton.icon(onPressed:filtered.isEmpty?null:()=>export(filtered),
          icon:const Icon(Icons.copy),label:const Text('複製 CSV')),
      ]),
      const SizedBox(height:6),
      for(final row in filtered.take(250)) Card(
        child:Padding(padding:const EdgeInsets.all(12),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[
              Expanded(child:Text('${row['project']} · ${row['provider']}',
                style:const TextStyle(fontWeight:FontWeight.w600))),
              Text('${row['day']}'),
            ]),
            Text('${row['model']} · ${row['status']} · ${number((row['calls'] as num?)??0)} 次'),
            Text('Owner: ${row['ownerId']}',style:Theme.of(context).textTheme.bodySmall),
            Text('來源：${row['source']} · Tokens: ${row['tokens']??'未提供'}',
              style:Theme.of(context).textTheme.bodySmall),
          ]))),
      if(filtered.length>250)
        const Text('畫面僅列出前 250 筆明細；複製 CSV 包含本次查詢的完整回傳列。'),
      const SizedBox(height:24),
      const Text('口徑：Gateway 帳本只涵蓋已成功預留配額的 Gemini 請求；拒絕於預留前的請求不在內。Chat 回合不一定代表已真正呼叫供應商，兩類數字不能相加。成本尚無經驗證單價，故不估算。'),
    ]);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(title:const Text('使用統計'),actions:[
      DropdownButtonHideUnderline(child:DropdownButton<int>(
        value:days,items:const [
          DropdownMenuItem(value:1,child:Text('今天')),
          DropdownMenuItem(value:7,child:Text('7 天')),
          DropdownMenuItem(value:30,child:Text('30 天')),
        ],onChanged:(value){if(value!=null){days=value;project='all';provider='all';status='all';reload();}}
      )),
      IconButton(tooltip:'重新整理',onPressed:reload,icon:const Icon(Icons.refresh)),
    ]),
    body:FutureBuilder<dynamic>(
      future:report,
      builder:(context,snapshot){
        if(snapshot.connectionState!=ConnectionState.done) {
          return const Center(child:CircularProgressIndicator());
        }
        if(snapshot.hasError) {
          return const Center(child:Padding(
            padding:EdgeInsets.all(24),
            child:Text('統計 API 讀取失敗或未授權，請檢查管理員權限與資料來源設定。')));
        }
        return content(snapshot.data);
      },
    ),
  );
}
