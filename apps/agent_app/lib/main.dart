import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'chat_api.dart';
import 'chat_page.dart';
import 'sign_in_button.dart' if (dart.library.js_util) 'sign_in_button_web.dart'
    as sign_in;

void main() => runApp(const OmniAgentApp());

class OmniAgentApp extends StatefulWidget {
  const OmniAgentApp({super.key});

  @override
  State<OmniAgentApp> createState() => _OmniAgentAppState();
}

class _OmniAgentAppState extends State<OmniAgentApp> {
  static const clientId = String.fromEnvironment('OMNIAGENT_GOOGLE_CLIENT_ID');
  ChatApi? api;
  String? error;
  StreamSubscription<GoogleSignInAccount?>? auth;

  @override
  void initState() {
    super.initState();
    if (clientId.isEmpty || ChatApi.base.isEmpty) return;
    final google = GoogleSignIn(clientId: clientId);
    auth = google.onCurrentUserChanged.listen((account) async {
      if (account == null) return;
      try {
        final token = (await account.authentication).idToken;
        if (token == null) throw StateError('Google ID token 不可用');
        if (mounted) setState(() => api = ChatApi(token));
      } catch (_) {
        if (mounted) setState(() => error = '登入失敗，請再試一次');
      }
    });
  }

  @override
  void dispose() {
    auth?.cancel();
    api?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'omniAgent',
        theme: ThemeData(colorSchemeSeed: Colors.cyan, useMaterial3: true),
        home: api == null
            ? Scaffold(
                body: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('omniAgent',
                    style: Theme.of(context).textTheme.headlineLarge),
                const SizedBox(height: 12),
                if (clientId.isEmpty || ChatApi.base.isEmpty)
                  const Text('登入或 API 尚未設定')
                else
                  sign_in.buildButton(),
                if (error != null) Text(error!),
              ])))
            : ChatPage(api!),
      );
}
