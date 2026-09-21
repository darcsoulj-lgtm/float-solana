'use client';
import { useState } from 'react';
import type { CommunityAuthor } from '@/lib/community-types';
import { MemberAvatar } from './member-avatar';
import { HolderTierBadge } from './holder-tier-badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

export function MemberProfile({ author, avatarOnly = false, nameOnly = false }: {
  author: CommunityAuthor;
  avatarOnly?: boolean;
  nameOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="member-profile-trigger" aria-label={`View ${author.alias}'s profile`} onClick={() => setOpen(true)}>
      {!nameOnly && <MemberAvatar alias={author.alias} memberId={author.member_id} version={author.avatar_key} />}
      {!avatarOnly && <span>{author.alias}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="member-profile-card">
        <MemberAvatar alias={author.alias} memberId={author.member_id} version={author.avatar_key} />
        <DialogTitle>{author.alias}</DialogTitle>
        <HolderTierBadge tier={author.value_tier} expiresAt={author.value_tier_expires_at} />
        <DialogDescription className="member-profile-bio">{author.bio?.trim() || 'No bio yet.'}</DialogDescription>
      </DialogContent>
    </Dialog>
  </>;
}
