import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/date_range_chooser.dart';
import '../../listings/data/models.dart';
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../data/models.dart';

typedef OfferDraft = ({DateTime start, DateTime end, int pricePerDayPaise});

/// Dates and a price per day for a new offer, or a counter to [counterTo].
Future<OfferDraft?> showOfferSheet(
  BuildContext context, {
  required ChatListing listing,
  Offer? counterTo,
}) => showModalBottomSheet<OfferDraft>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => OfferSheet(listing: listing, counterTo: counterTo),
);

class OfferSheet extends ConsumerStatefulWidget {
  const OfferSheet({required this.listing, this.counterTo, super.key});

  final ChatListing listing;
  final Offer? counterTo;

  @override
  ConsumerState<OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends ConsumerState<OfferSheet> {
  late BlockedRange? _dates = widget.counterTo == null
      ? null
      : BlockedRange(widget.counterTo!.startDate, widget.counterTo!.endDate);
  late final _price = TextEditingController(
    text:
        ((widget.counterTo?.pricePerDayPaise ??
                    widget.listing.pricePerDayPaise) ~/
                100)
            .toString(),
  );

  @override
  void initState() {
    super.initState();
    _price.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _price.dispose();
    super.dispose();
  }

  int? get _pricePaise {
    final rupees = int.tryParse(_price.text.trim());
    return rupees == null || rupees <= 0 ? null : rupees * 100;
  }

  int? get _days =>
      _dates == null ? null : _dates!.end.difference(_dates!.start).inDays + 1;

  Future<void> _chooseDates() async {
    final first = today();
    final range = await ref.read(dateRangeChooserProvider)(
      context,
      first: first,
      last: first.add(const Duration(days: 365)),
      initial: _dates == null
          ? null
          : DateTimeRange(start: _dates!.start, end: _dates!.end),
    );
    if (range != null) {
      setState(() => _dates = BlockedRange(range.start, range.end));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final price = _pricePaise;
    final days = _days;
    final ready = price != null && days != null;
    final listed = widget.listing.pricePerDayPaise;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        SajhaSpacing.lg,
        0,
        SajhaSpacing.lg,
        SajhaSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.counterTo == null ? 'Make an offer' : 'Counter-offer',
            style: text.titleLarge,
          ),
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            'Listed at ${formatRupees(listed)}/day · '
            '${widget.listing.minDays}–${widget.listing.maxDays} days',
            style: TextStyle(color: muted),
          ),
          const SizedBox(height: SajhaSpacing.md),
          OutlinedButton.icon(
            key: const ValueKey('offer-dates'),
            onPressed: _chooseDates,
            icon: const Icon(Icons.event_outlined),
            label: Text(
              _dates == null
                  ? 'Choose dates'
                  : '${formatRange(_dates!)} · $days ${days == 1 ? 'day' : 'days'}',
            ),
          ),
          const SizedBox(height: SajhaSpacing.md),
          TextField(
            key: const ValueKey('offer-price'),
            controller: _price,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
              labelText: 'Price per day',
              prefixText: '₹ ',
            ),
          ),
          if (ready) ...[
            const SizedBox(height: SajhaSpacing.md),
            Text(
              '${formatRupees(price)} × $days ${days == 1 ? 'day' : 'days'} = '
              '${formatRupees(price * days)} rent, plus a '
              '${formatRupees(widget.listing.depositPaise)} refundable deposit',
              key: const ValueKey('offer-preview'),
            ),
          ],
          const SizedBox(height: SajhaSpacing.lg),
          FilledButton(
            key: const ValueKey('offer-submit'),
            onPressed: ready
                ? () => Navigator.pop<OfferDraft>(context, (
                    start: _dates!.start,
                    end: _dates!.end,
                    pricePerDayPaise: price,
                  ))
                : null,
            child: Text(
              widget.counterTo == null ? 'Send offer' : 'Send counter-offer',
            ),
          ),
        ],
      ),
    );
  }
}
