import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../shared/widgets/verify_email_dialog.dart';
import '../../auth/application/auth_controller.dart';
import '../data/chat_repository.dart';

const _whyVerify =
    'To keep chats safe, everyone chatting on Nivra has a verified phone and email.';

/// "Chat" on a listing. Guests sign in first and come back here; people
/// without a verified email are asked to verify it; everyone else lands in
/// the chat (created the first time).
Future<void> openChat(
  BuildContext context,
  WidgetRef ref,
  String listingId,
) async {
  final auth = ref.read(authControllerProvider);
  if (auth is! Authenticated) {
    requireSignIn(context, ref, Routes.item(listingId, chat: true));
    return;
  }
  if (!auth.user.emailVerified) {
    await askToVerifyEmail(context, why: _whyVerify);
    return;
  }
  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  try {
    final conversation = await ref
        .read(chatRepositoryProvider)
        .start(listingId);
    router.push(Routes.chat(conversation.id));
  } on ApiException catch (e) {
    if (e.code == 'VERIFICATION_REQUIRED' && context.mounted) {
      await askToVerifyEmail(context, why: _whyVerify);
    } else {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }
}
