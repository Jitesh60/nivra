import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/otp_field.dart';
import '../data/models.dart';

/// Shared "enter the 6-digit code" screen for phone and email verification.
class OtpVerifyScreen extends StatefulWidget {
  const OtpVerifyScreen({
    super.key,
    required this.title,
    required this.destination,
    required this.challenge,
    required this.verify,
    required this.resend,
  });

  final String title;

  /// Where the code was sent, e.g. "+91 98765 43210".
  final String destination;
  final OtpChallenge challenge;

  /// Throws [ApiException] on a wrong or expired code.
  final Future<void> Function(String challengeId, String code) verify;
  final Future<OtpChallenge> Function() resend;

  @override
  State<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends State<OtpVerifyScreen> {
  late OtpChallenge _challenge = widget.challenge;
  final _code = TextEditingController();
  Timer? _timer;
  int _secondsLeft = 0;
  int _errorCount = 0;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startCountdown(_challenge.resendAfterSec);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_secondsLeft <= 1) t.cancel();
      if (mounted) {
        setState(() => _secondsLeft = (_secondsLeft - 1).clamp(0, 1 << 30));
      }
    });
  }

  Future<void> _verify(String code) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.verify(_challenge.challengeId, code);
    } on ApiException catch (e) {
      if (!mounted) return;
      _code.clear();
      setState(() {
        _error = e.friendlyMessage;
        _errorCount++;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = await widget.resend();
      if (!mounted) return;
      _code.clear();
      setState(() => _challenge = next);
      _startCountdown(next.resendAfterSec);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.friendlyMessage);
      final wait = e.retryAfterSec;
      if (e.code == 'OTP_COOLDOWN' && wait != null) _startCountdown(wait);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          children: [
            Text(widget.title, style: text.headlineSmall),
            const SizedBox(height: SajhaSpacing.sm),
            Text.rich(
              TextSpan(
                text: 'Enter the 6-digit code sent to ',
                children: [
                  TextSpan(
                    text: widget.destination,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              style: text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: SajhaSpacing.xl),
            OtpField(
              controller: _code,
              errorCount: _errorCount,
              enabled: !_busy,
              onCompleted: _verify,
            ),
            const SizedBox(height: SajhaSpacing.md),
            SizedBox(
              height: 48,
              child: _busy
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                  ? Text(
                      _error!,
                      key: const ValueKey('otp-error'),
                      style: text.bodyMedium?.copyWith(color: scheme.error),
                    )
                  : null,
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const ValueKey('resend'),
                onPressed: _secondsLeft == 0 && !_busy ? _resend : null,
                child: Text(
                  _secondsLeft == 0
                      ? 'Resend code'
                      : 'Resend code in ${_secondsLeft}s',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
