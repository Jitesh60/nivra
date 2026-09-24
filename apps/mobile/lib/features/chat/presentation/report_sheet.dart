import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../data/models.dart';

typedef ReportDraft = ({ReportReason reason, String? note});

/// Why something is being reported, plus an optional note.
Future<ReportDraft?> showReportSheet(
  BuildContext context, {
  required String title,
}) => showModalBottomSheet<ReportDraft>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => ReportSheet(title: title),
);

class ReportSheet extends StatefulWidget {
  const ReportSheet({required this.title, super.key});
  final String title;

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  ReportReason? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      SajhaSpacing.lg,
      0,
      SajhaSpacing.lg,
      SajhaSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: SajhaSpacing.xs),
          const Text(
            'Our team reviews every report. The other person isn’t told who reported them.',
          ),
          const SizedBox(height: SajhaSpacing.sm),
          for (final r in ReportReason.values)
            ListTile(
              key: ValueKey('reason-${r.apiValue}'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                _reason == r
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                color: _reason == r ? SajhaColors.brand600 : null,
              ),
              title: Text(r.label),
              onTap: () => setState(() => _reason = r),
            ),
          TextField(
            key: const ValueKey('report-note'),
            controller: _note,
            maxLength: 1000,
            maxLines: 3,
            minLines: 1,
            decoration: const InputDecoration(
              labelText: 'Anything else we should know? (optional)',
            ),
          ),
          const SizedBox(height: SajhaSpacing.sm),
          FilledButton(
            key: const ValueKey('report-submit'),
            onPressed: _reason == null
                ? null
                : () => Navigator.pop<ReportDraft>(context, (
                    reason: _reason!,
                    note: _note.text,
                  )),
            child: const Text('Send report'),
          ),
        ],
      ),
    ),
  );
}
