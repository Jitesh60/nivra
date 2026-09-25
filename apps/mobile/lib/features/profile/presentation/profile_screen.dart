import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/user_avatar.dart';
import '../../../shared/widgets/verification_badges.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/data/models.dart';
import '../data/profile_repository.dart';

/// Your profile: photo, name, city, bio and verification badges.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _city;
  late final TextEditingController _bio;
  bool _saving = false;

  /// 0–1 while the photo uploads; null otherwise.
  double? _photoProgress;

  @override
  void initState() {
    super.initState();
    final user = _user;
    _name = TextEditingController(text: user?.name ?? '');
    _city = TextEditingController(text: user?.city ?? '');
    _bio = TextEditingController(text: user?.bio ?? '');
    for (final c in [_name, _city, _bio]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    _bio.dispose();
    super.dispose();
  }

  AppUser? get _user => switch (ref.read(authControllerProvider)) {
    Authenticated(:final user) => user,
    _ => null,
  };

  bool _dirty(AppUser user) =>
      _name.text.trim() != (user.name ?? '') ||
      _city.text.trim() != (user.city ?? '') ||
      _bio.text.trim() != (user.bio ?? '');

  ProfileRepository get _repo => ref.read(profileRepositoryProvider);

  void _updated(AppUser user) =>
      ref.read(authControllerProvider.notifier).userUpdated(user);

  void _toast(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      _updated(
        await _repo.update(
          name: _name.text.trim(),
          city: _city.text.trim(),
          bio: _bio.text.trim(),
        ),
      );
      if (mounted) {
        FocusScope.of(context).unfocus();
        _toast('Profile saved');
      }
    } on ApiException catch (e) {
      if (mounted) _toast(e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePhoto(AppUser user) async {
    final choice = await choosePhotoSource(
      context,
      allowRemove: user.avatarUrl != null,
    );
    if (choice == null || !mounted) return;
    try {
      if (choice == PhotoSourceChoice.remove) {
        setState(() => _photoProgress = 0);
        _updated(await _repo.removeAvatar());
        return;
      }
      final photo = await ref
          .read(photoPickerProvider)
          .pick(choice.source!, squareCrop: true);
      if (photo == null || !mounted) return;
      setState(() => _photoProgress = 0);
      _updated(
        await _repo.setAvatar(
          photo,
          onProgress: (p) {
            if (mounted) setState(() => _photoProgress = p);
          },
        ),
      );
      if (mounted) _toast('Profile photo updated');
    } on ApiException catch (e) {
      if (mounted) _toast(e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _photoProgress = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();
    final user = auth.user;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: const Text('Your profile')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          children: [
            Center(
              child: _AvatarEditor(
                user: user,
                progress: _photoProgress,
                onTap: _photoProgress == null ? () => _changePhoto(user) : null,
              ),
            ),
            const SizedBox(height: SajhaSpacing.sm),
            Center(
              child: Text(user.phone, style: TextStyle(color: muted)),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            VerificationBadges(user: user),
            const SizedBox(height: SajhaSpacing.lg),
            TextFormField(
              key: const ValueKey('profile-name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              maxLength: 80,
              decoration: const InputDecoration(
                labelText: 'Full name',
                counterText: '',
              ),
              validator: (v) => (v ?? '').trim().length < 2
                  ? 'Enter your name as on your ID'
                  : null,
            ),
            const SizedBox(height: SajhaSpacing.md),
            TextFormField(
              key: const ValueKey('profile-city'),
              controller: _city,
              textCapitalization: TextCapitalization.words,
              maxLength: 80,
              decoration: const InputDecoration(
                labelText: 'City',
                hintText: 'e.g. Pune',
                counterText: '',
              ),
            ),
            const SizedBox(height: SajhaSpacing.md),
            TextFormField(
              key: const ValueKey('profile-bio'),
              controller: _bio,
              maxLines: 4,
              minLines: 2,
              maxLength: 300,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'About you',
                hintText: 'What do you like to borrow or lend?',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: SajhaSpacing.md),
            FilledButton(
              key: const ValueKey('profile-save'),
              onPressed: _saving || !_dirty(user) ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save'),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            const Divider(),
            ListTile(
              key: const ValueKey('open-my-bookings'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.calendarDays),
              title: const Text('My bookings'),
              subtitle: const Text('Things you’re borrowing and lending'),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () => context.push(Routes.bookings),
            ),
            ListTile(
              key: const ValueKey('open-earnings'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.wallet),
              title: const Text('Earnings & payouts'),
              subtitle: const Text('Money from lending, and your bank account'),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () => context.push(Routes.earnings),
            ),
            ListTile(
              key: const ValueKey('open-documents'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.idCard),
              title: const Text('My documents'),
              subtitle: Text(
                user.idVerified
                    ? 'ID verified'
                    : 'Add an ID to get the verified badge',
              ),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () => context.push(Routes.documents),
            ),
            Text(
              'Your name, city, photo and badges are shown to people you '
              'rent with. Your phone number and documents are not.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarEditor extends StatelessWidget {
  const _AvatarEditor({
    required this.user,
    required this.progress,
    required this.onTap,
  });

  final AppUser user;
  final double? progress;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: 'Change profile photo',
      child: InkWell(
        key: const ValueKey('change-photo'),
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Stack(
          alignment: Alignment.center,
          children: [
            UserAvatar(user: user, radius: 48),
            if (progress != null)
              SizedBox(
                width: 96,
                height: 96,
                child: CircularProgressIndicator(
                  value: progress! > 0 && progress! < 1 ? progress : null,
                  strokeWidth: 3,
                ),
              ),
            Positioned(
              right: 0,
              bottom: 0,
              child: CircleAvatar(
                radius: 16,
                backgroundColor: scheme.primary,
                child: Icon(
                  LucideIcons.camera,
                  size: 16,
                  color: scheme.onPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
