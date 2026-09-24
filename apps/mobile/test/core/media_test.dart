import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/upload_client.dart';
import 'package:sajha/features/auth/data/models.dart';
import 'package:sajha/features/documents/data/models.dart';

void main() {
  test('sniffImageType recognises JPEG, PNG and WebP only', () {
    Uint8List bytes(List<int> head) => Uint8List(32)..setAll(0, head);
    expect(sniffImageType(bytes([0xFF, 0xD8, 0xFF, 0xE1])), 'image/jpeg');
    expect(
      sniffImageType(bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
      'image/png',
    );
    expect(
      sniffImageType(
        bytes([...'RIFF'.codeUnits, 0, 0, 0, 0, ...'WEBP'.codeUnits]),
      ),
      'image/webp',
    );
    expect(sniffImageType(bytes('%PDF-1.7'.codeUnits)), isNull);
    expect(sniffImageType(bytes('GIF89a'.codeUnits)), isNull);
    expect(sniffImageType(Uint8List(2)), isNull);
  });

  test('AppUser parses profile fields and initials', () {
    final user = AppUser.fromJson({
      'id': 'u1',
      'phone': '+919876543210',
      'name': 'Rahul  Kumar Sharma',
      'city': 'Pune',
      'bio': null,
      'avatarUrl': 'https://cdn.sajha.app/a.webp',
      'idVerified': true,
      'phoneVerified': true,
      'emailVerified': true,
    });
    expect(user.initials, 'RS');
    expect(user.city, 'Pune');
    expect(user.idVerified, isTrue);
    expect(
      AppUser.fromJson({'id': 'u2', 'phone': '+919876543211'}).initials,
      '?',
    );
  });

  test('UserDocument parses the API shape and knows when it has expired', () {
    final doc = UserDocument.fromJson({
      'id': 'd1',
      'type': 'COLLEGE_ID',
      'label': null,
      'status': 'APPROVED',
      'rejectionReason': null,
      'hasBack': false,
      'expiresOn': '2027-06-30',
      'createdAt': '2026-09-24T10:00:00.000Z',
      'reviewedAt': '2026-09-24T11:00:00.000Z',
    });
    expect(doc.type, DocumentType.collegeId);
    expect(doc.status, DocumentStatus.approved);
    expect(doc.title, 'College ID');
    expect(doc.isExpired(DateTime(2027, 6, 30)), isFalse);
    expect(doc.isExpired(DateTime(2027, 7, 1)), isTrue);

    final other = UserDocument.fromJson({
      'id': 'd2',
      'type': 'OTHER',
      'label': 'Gym card',
      'status': 'REJECTED',
      'hasBack': false,
      'createdAt': '2026-09-24T10:00:00.000Z',
    });
    expect(other.title, 'Gym card');
    expect(other.isLive, isFalse);
    expect(DocumentType.fromApi('SOMETHING_NEW'), DocumentType.other);
  });
}
