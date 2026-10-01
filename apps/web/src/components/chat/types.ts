import type { Schemas } from '@sajha/api-client';

export type ChatConversation = Schemas['ConversationDto'];
export type ChatMessage = Schemas['MessageDto'];
export type ChatOffer = Schemas['OfferDto'];
export type Result = { error?: string; success?: string };
