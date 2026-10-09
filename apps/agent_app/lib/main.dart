import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'chat_api.dart';
import 'auth_session.dart';
import 'chat_page.dart';
import 'omni_theme.dart';
import 'twin_beast_mascot.dart';
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
  late final AuthSessionController sessions;

  @override
  void initState() {
    super.initState();
    sessions = AuthSessionController(
      onSession: (current) {
        if (mounted) {
          setState(() {
            api = current;
            error = null;
          });
        }
      },
      onError: () {
        if (mounted) {
          setState(() => error = '登入失敗，請再試一次');
        }
      },
    );
    if (clientId.isEmpty || ChatApi.base.isEmpty) return;
    final google = GoogleSignIn(clientId: clientId);
    auth = google.onCurrentUserChanged.listen((account) {
      // Invalidate the previous API immediately on logout or account switch.
      // A late ID-token result from an earlier account must never restore it.
      unawaited(sessions.update(
        account == null ? null : () async => (await account.authentication).idToken,
      ));
    });
  }

  @override
  void dispose() {
    auth?.cancel();
    sessions.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'omniAgent',
        theme: OmniTheme.light,
        home: api == null
            ? Builder(
                builder: (context) => Scaffold(
                  body: SafeArea(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 440),
                          child: Card(
                            margin: EdgeInsets.zero,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(24),
                              side: const BorderSide(
                                color: OmniColors.milkTea,
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(28),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const TwinBeastMascotSlot(),
                                  const SizedBox(height: 20),
                                  Text(
                                    'omniAgent',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineMedium
                                        ?.copyWith(
                                          fontWeight: FontWeight.w700,
                                        ),
                                  ),
                                  const SizedBox(height: 8),
                                  const Text(
                                    '讓雙生獸陪你把想法整理成下一步。',
                                    textAlign: TextAlign.center,
                                  ),
                                  const SizedBox(height: 24),
                                  if (clientId.isEmpty || ChatApi.base.isEmpty)
                                    const Text('登入或 API 尚未設定')
                                  else
                                    sign_in.buildButton(),
                                  if (error != null) ...[
                                    const SizedBox(height: 12),
                                    Text(error!),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              )
            // A Google account change must destroy the previous ChatPage
            // State (thread cache, event cursor and pending poller). Reusing
            // an unkeyed StatefulWidget can leak the old owner's UI state.
            : ChatPage(api!, key: ObjectKey(api)),
      );
}
