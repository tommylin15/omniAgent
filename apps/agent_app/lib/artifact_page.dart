import 'package:flutter/material.dart';
import 'chat_api.dart';

class ArtifactPage extends StatefulWidget {
  const ArtifactPage(this.api,{super.key});
  final ChatApi api;
  @override
  State<ArtifactPage> createState()=>_ArtifactPageState();
}
class _ArtifactPageState extends State<ArtifactPage>{
  final text=TextEditingController();
  List<Map<String,dynamic>> items=[];
  Map<String,dynamic> capabilities={};
  bool loading=true,busy=false;
  String? error;
  @override
  void initState(){super.initState();load();}
  @override
  void dispose(){text.dispose();super.dispose();}
  Future<void> load() async{
    if(mounted){setState((){loading=true;error=null;});}
    try{
      final caps=await widget.api.get('/v1/capabilities');
      final result=caps is Map&&caps['artifactsEnabled']==true
          ? await widget.api.get('/v1/artifacts'):null;
      if(!mounted){return;}
      setState((){
        capabilities=caps is Map?Map<String,dynamic>.from(caps):{};
        items=result is Map&&result['items'] is List
            ? [for(final row in result['items'] as List) if(row is Map) Map<String,dynamic>.from(row)]:[];
        loading=false;
      });
    }catch(_){if(mounted){setState((){loading=false;error='產物無法載入，請稍後重試。';});}}
  }
  Future<void> perform(Future<void> Function() operation) async{
    if(busy){return;}
    setState((){busy=true;error=null;});
    try{await operation();}
    catch(_){if(mounted){setState(()=>error='操作結果尚未核實；請重新讀取原紀錄。');}}
    finally{if(mounted){setState(()=>busy=false);}}
  }
  Future<void> upload()=>perform(() async{
    if(text.text.trim().isEmpty){return;}
    await widget.api.post('/v1/artifacts/text',{'text':text.text});
    text.clear();await load();
  });
  Future<void> read(String id)=>perform(() async{
    final result=await widget.api.get('/v1/artifacts/$id/text');
    if(!mounted||result is! Map||result['text'] is! String){return;}
    await showDialog<void>(context:context,builder:(context)=>AlertDialog(
      title:const Text('產物內容'),content:SingleChildScrollView(child:SelectableText(result['text'] as String)),
      actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('關閉'))]));
  });
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('我的產物'),actions:[IconButton(tooltip:'重新讀取',
      onPressed:busy?null:load,icon:const Icon(Icons.refresh))]),
    body:loading?const Center(child:CircularProgressIndicator()):ListView(
      padding:const EdgeInsets.all(16),children:[
        if(capabilities['artifactsEnabled']!=true)
          const Text('產物儲存尚未啟用。')
        else ...[
          TextField(controller:text,minLines:3,maxLines:8,maxLength:8192,
            decoration:const InputDecoration(labelText:'保存文字產物',border:OutlineInputBorder())),
          const SizedBox(height:8),FilledButton(onPressed:busy?null:upload,child:const Text('保存並核對')),
          const SizedBox(height:16),
          for(final item in items)Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(
            crossAxisAlignment:CrossAxisAlignment.start,children:[
              SelectableText('${item['id']}'),Text('狀態：${item['state']} · ${item['byte_length']} bytes'),
              Wrap(spacing:8,children:[
                if(item['state']=='available'&&item['content_type'].toString().startsWith('text/'))
                  TextButton(onPressed:busy?null:()=>read(item['id'].toString()),child:const Text('讀取內容')),
                if(item['state']!='available')
                  TextButton(onPressed:busy?null:()=>perform(() async{
                    await widget.api.post('/v1/artifacts/${item['id']}/reconcile',{});await load();
                  }),child:const Text('核對儲存結果')),
                if(item['state']=='available'&&capabilities['archiveEnabled']==true)
                  TextButton(onPressed:busy?null:()=>perform(() async{
                    await widget.api.post('/v1/artifacts/${item['id']}/archive',{});
                    if(mounted){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('封存快照已核對')));}
                  }),child:const Text('封存並核對快照')),
              ]),
            ]))),
        ],
        if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
      ]),
  );
}
