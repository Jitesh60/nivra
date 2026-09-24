import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/documents_repository.dart';
import '../data/models.dart';
import 'documents_screen.dart';

/// Choose a document type, read the guidance, add photos, submit for review.
/// Pops `true` once the document is submitted.
class AddDocumentScreen extends ConsumerStatefulWidget {
  const AddDocumentScreen({super.key});

  @override
  ConsumerState<AddDocumentScreen> createState() => _AddDocumentScreenState();
}

class _AddDocumentScreenState extends ConsumerState<AddDocumentScreen> {
  final _label = TextEditingController();
  DocumentType? _type;
  Uint8List? _front;
  Uint8List? _back;
  DateTime? _expiresOn;

  /// 0–1 while uploading; null otherwise.
  double? _progress;

  @override
  void initState() {
    super.initState();
    _label.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  bool get _ready {
    final type = _type;
    if (type == null || _front == null || _progress != null) return false;
    if (type.hasBack && _back == null) return false;
    if (type == DocumentType.other && _label.text.trim().length < 2) {
      return false;
    }
    return true;
  }

  Future<void> _pick(DocumentSide side) async {
    final choice = await choosePhotoSource(context);
    if (choice?.source == null || !mounted) return;
    final photo = await ref.read(photoPickerProvider).pick(choice!.source!);
    if (photo == null || !mounted) return;
    setState(() => side == DocumentSide.front ? _front = photo : _back = photo);
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiresOn ?? DateTime(now.year + 1, now.month, now.day),
      firstDate: now,
      lastDate: DateTime(now.year + 30),
      helpText: 'Valid until',
    );
    if (picked != null) setState(() => _expiresOn = picked);
  }

  Future<void> _submit() async {
    final type = _type!;
    setState(() => _progress = 0);
    try {
      await ref
          .read(documentsRepositoryProvider)
          .add(
            type: type,
            front: _front!,
            back: type.hasBack ? _back : null,
            label: type == DocumentType.other ? _label.text : null,
            expiresOn: _expiresOn,
            onProgress: (p) {
              if (mounted) setState(() => _progress = p);
            },
          );
      if (mounted) context.pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _progress = null);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final existing = ref.watch(myDocumentsProvider).value ?? const [];
    final taken = {
      // One pending or approved document per type (OTHER included).
      for (final d in existing)
        if (d.isLive) d.type,
    };
    final type = _type;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Add a document')),
      body: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          DropdownButtonFormField<DocumentType>(
            key: const ValueKey('doc-type'),
            initialValue: type,
            decoration: const InputDecoration(labelText: 'Document'),
            items: [
              for (final t in DocumentType.values)
                DropdownMenuItem(
                  value: t,
                  enabled: !taken.contains(t),
                  child: Text(
                    taken.contains(t) ? '${t.label} (already added)' : t.label,
                  ),
                ),
            ],
            onChanged: _progress != null
                ? null
                : (t) => setState(() {
                    _type = t;
                    if (!(t?.hasBack ?? false)) _back = null;
                  }),
          ),
          if (type == DocumentType.other) ...[
            const SizedBox(height: SajhaSpacing.md),
            TextField(
              key: const ValueKey('doc-label'),
              controller: _label,
              maxLength: 60,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'What is it?',
                hintText: 'e.g. Gym membership card',
              ),
            ),
          ],
          if (type != null) ...[
            const SizedBox(height: SajhaSpacing.md),
            _Guidance(type: type),
            const SizedBox(height: SajhaSpacing.lg),
            Text('Photos', style: text.titleMedium),
            const SizedBox(height: SajhaSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: _PhotoSlot(
                    key: const ValueKey('photo-front'),
                    label: type.hasBack ? 'Front' : 'Photo',
                    photo: _front,
                    onTap: _progress == null
                        ? () => _pick(DocumentSide.front)
                        : null,
                  ),
                ),
                if (type.hasBack) ...[
                  const SizedBox(width: SajhaSpacing.md),
                  Expanded(
                    child: _PhotoSlot(
                      key: const ValueKey('photo-back'),
                      label: 'Back',
                      photo: _back,
                      onTap: _progress == null
                          ? () => _pick(DocumentSide.back)
                          : null,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: SajhaSpacing.md),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(
                _expiresOn == null
                    ? 'Expiry date (optional)'
                    : 'Valid until ${_expiresOn!.day}/${_expiresOn!.month}/${_expiresOn!.year}',
              ),
              trailing: _expiresOn == null
                  ? null
                  : IconButton(
                      tooltip: 'Clear expiry date',
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(() => _expiresOn = null),
                    ),
              onTap: _progress == null ? _pickExpiry : null,
            ),
          ],
          const SizedBox(height: SajhaSpacing.lg),
          if (_progress != null) ...[
            LinearProgressIndicator(value: _progress! > 0 ? _progress : null),
            const SizedBox(height: SajhaSpacing.sm),
          ],
          FilledButton(
            key: const ValueKey('doc-submit'),
            onPressed: _ready ? _submit : null,
            child: Text(_progress == null ? 'Submit for review' : 'Uploading…'),
          ),
        ],
      ),
    );
  }
}

class _Guidance extends StatelessWidget {
  const _Guidance({required this.type});

  final DocumentType type;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tips = [
      if (type == DocumentType.aadhaarMasked) ...[
        'Use a masked Aadhaar: download it from the UIDAI website '
            '(myaadhaar.uidai.gov.in) and choose “masked Aadhaar”. Only the '
            'last 4 digits show.',
        'Never upload a full Aadhaar number.',
      ],
      if (type == DocumentType.pan || type == DocumentType.passport)
        'Photograph the page with your photo and name.',
      if (type == DocumentType.addressProof)
        'A recent utility bill, rent agreement or bank statement with your '
            'name and address.',
      'Lay it flat in good light. Avoid glare and cut-off edges.',
      'All the text must be readable.',
    ];
    return Container(
      key: const ValueKey('doc-guidance'),
      padding: const EdgeInsets.all(SajhaSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final tip in tips)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  '),
                  Expanded(child: Text(tip)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PhotoSlot extends StatelessWidget {
  const _PhotoSlot({
    required this.label,
    required this.photo,
    required this.onTap,
    super.key,
  });

  final String label;
  final Uint8List? photo;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.add_a_photo_outlined, color: scheme.primary),
        const SizedBox(height: SajhaSpacing.xs),
        Text('Add ${label.toLowerCase()}'),
      ],
    );
    return Semantics(
      button: true,
      label: photo == null
          ? 'Add ${label.toLowerCase()}'
          : 'Replace ${label.toLowerCase()}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
        child: AspectRatio(
          aspectRatio: 1.58, // ID-1 card
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(SajhaRadius.lg),
            ),
            child: photo == null
                ? placeholder
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.memory(
                        photo!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => placeholder,
                      ),
                      Positioned(
                        left: SajhaSpacing.xs,
                        bottom: SajhaSpacing.xs,
                        child: Chip(
                          visualDensity: VisualDensity.compact,
                          avatar: const Icon(Icons.check, size: 16),
                          label: Text(label),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
