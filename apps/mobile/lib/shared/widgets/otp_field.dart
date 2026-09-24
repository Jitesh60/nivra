import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/theme/tokens.g.dart';

/// Six-box one-time-code input.
///
/// A single hidden [TextField] drives the boxes, so paste and the keyboard's
/// SMS / email code suggestion (`AutofillHints.oneTimeCode`, Android and iOS)
/// fill all six at once. Increment [errorCount] to shake the boxes.
class OtpField extends StatefulWidget {
  const OtpField({
    super.key,
    required this.onCompleted,
    this.controller,
    this.length = 6,
    this.errorCount = 0,
    this.enabled = true,
  });

  final ValueChanged<String> onCompleted;
  final TextEditingController? controller;
  final int length;
  final int errorCount;
  final bool enabled;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_changed);
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    if (widget.controller == null) _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed() {
    setState(() {});
    final code = _controller.text;
    if (code.length == widget.length) widget.onCompleted(code);
  }

  @override
  Widget build(BuildContext context) {
    final code = _controller.text;
    final scheme = Theme.of(context).colorScheme;
    final hasError = widget.errorCount > 0;

    final boxes = Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(widget.length, (i) {
        final filled = i < code.length;
        final active =
            _focus.hasFocus && i == code.length.clamp(0, widget.length - 1);
        return AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 48,
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(SajhaRadius.md),
            border: Border.all(
              width: active ? 2 : 1,
              color: hasError && code.isEmpty
                  ? scheme.error
                  : active
                  ? scheme.primary
                  : scheme.outlineVariant,
            ),
          ),
          child: Text(
            filled ? code[i] : '',
            style: Theme.of(context).textTheme.headlineSmall
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
        );
      }),
    );

    return Stack(
      children: [
        // A new key per error replays the shake.
        if (hasError && !MediaQuery.disableAnimationsOf(context))
          boxes
              .animate(key: ValueKey(widget.errorCount))
              .shake(hz: 5, offset: const Offset(8, 0), duration: 400.ms)
        else
          boxes,
        // Invisible input on top of the boxes: receives taps, typing, paste
        // and autofill. Semantics come from here.
        Positioned.fill(
          child: Opacity(
            opacity: 0,
            child: TextField(
              key: const ValueKey('otp-input'),
              controller: _controller,
              focusNode: _focus,
              enabled: widget.enabled,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(widget.length),
              ],
              showCursor: false,
              enableInteractiveSelection: false,
              decoration: const InputDecoration(
                border: InputBorder.none,
                counterText: '',
              ),
            ),
          ),
        ),
      ],
    );
  }
}
