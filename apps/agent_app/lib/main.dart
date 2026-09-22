import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'chat_api.dart';
import 'chat_page.dart';

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
  bool busy = false;

  Future<void> signIn() async {
    if (clientId.isEmpty || ChatApi.base.isEmpty) {
      setState(() => error = '登入或 API 尚未設定');
      return;
    }
    setState(() => busy = true);
    try {
      final account = await GoogleSignIn(clientId: clientId).signIn();
      final token = (await account?.authentication)?.idToken;
      if (token == null) throw StateError('Google ID token 不可用');
      if (mounted) setState(() => api = ChatApi(token));
    } catch (_) {
      if (mounted) setState(() => error = '登入失敗，請再試一次');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
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
                FilledButton(
                    onPressed: busy ? null : signIn,
                    child: const Text('使用 Google 登入')),
                if (error != null) Text(error!),
              ])))
            : ChatPage(api!),
      );
}
