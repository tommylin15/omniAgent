import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:omniagent_app/artifact_page.dart';
import 'package:omniagent_app/chat_api.dart';

void main(){
  testWidgets('disabled artifact storage does not offer a write',(tester) async{
    final api=ChatApi('fixture',baseUrl:'https://example.invalid',client:MockClient((request) async=>
      http.Response(jsonEncode({'artifactsEnabled':false}),200)));
    await tester.pumpWidget(MaterialApp(home:ArtifactPage(api)));await tester.pumpAndSettle();
    expect(find.text('產物儲存尚未啟用。'),findsOneWidget);expect(find.text('保存並核對'),findsNothing);
  });
  testWidgets('uncertain upload retains text and requests readback',(tester) async{
    final api=ChatApi('fixture',baseUrl:'https://example.invalid',client:MockClient((request) async{
      if(request.url.path=='/v1/capabilities'){return http.Response(jsonEncode({'artifactsEnabled':true}),200);}
      if(request.method=='POST'){return http.Response('{"error":"conflict"}',409);}
      return http.Response('{"items":[]}',200);
    }));
    await tester.pumpWidget(MaterialApp(home:ArtifactPage(api)));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'keep this draft');
    await tester.tap(find.text('保存並核對'));await tester.pumpAndSettle();
    expect(find.text('keep this draft'),findsOneWidget);expect(find.textContaining('操作結果尚未核實'),findsOneWidget);
  });
}
