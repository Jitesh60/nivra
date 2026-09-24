'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
  type CategoryFormState,
} from './actions';

function Message({ state }: { state: CategoryFormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.done)
    return (
      <p role="status" className="text-sm text-primary">
        {state.done}
      </p>
    );
  return null;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function Fields({
  state,
  defaults,
  prefix,
}: {
  state: CategoryFormState;
  defaults?: { name: string; slug: string; icon: string };
  prefix: string;
}) {
  const [name, setName] = useState(defaults?.name ?? '');
  const [slug, setSlug] = useState(defaults?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults));
  const field = (key: string) => state.fields?.[key];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-name`}>Name</Label>
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          minLength={2}
          maxLength={40}
          value={name}
          aria-invalid={Boolean(field('name'))}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        {field('name') && <p className="text-xs text-destructive">{field('name')}</p>}
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-slug`}>Slug</Label>
        <Input
          id={`${prefix}-slug`}
          name="slug"
          required
          minLength={2}
          maxLength={40}
          value={slug}
          aria-invalid={Boolean(field('slug'))}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
        {field('slug') && <p className="text-xs text-destructive">{field('slug')}</p>}
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-icon`}>Icon</Label>
        <Input
          id={`${prefix}-icon`}
          name="icon"
          required
          minLength={2}
          maxLength={40}
          placeholder="music_note"
          defaultValue={defaults?.icon}
          aria-invalid={Boolean(field('icon'))}
        />
        {field('icon') ? (
          <p className="text-xs text-destructive">{field('icon')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            A{' '}
            <a
              className="underline"
              href="https://fonts.google.com/icons"
              target="_blank"
              rel="noreferrer"
            >
              Material Symbols
            </a>{' '}
            name
          </p>
        )}
      </div>
    </div>
  );
}

export function CreateCategoryForm() {
  const [state, action] = useActionState(createCategoryAction, {});
  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Add a category</h2>
      <Fields state={state} prefix="new" key={state.done} />
      <div className="flex items-center gap-3">
        <SubmitButton className="w-fit">Add category</SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CategoryRowActions({
  category,
  order,
  first,
  last,
}: {
  category: { id: string; name: string; slug: string; icon: string; isActive: boolean };
  order: string[];
  first: boolean;
  last: boolean;
}) {
  const [moveState, move, moving] = useActionState(moveCategoryAction, {});
  const [toggleState, toggle, toggling] = useActionState(updateCategoryAction, {});
  const [editState, edit] = useActionState(updateCategoryAction, {});
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {(['up', 'down'] as const).map((direction) => (
          <form key={direction} action={move}>
            <input type="hidden" name="id" value={category.id} />
            <input type="hidden" name="order" value={order.join(',')} />
            <input type="hidden" name="direction" value={direction} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={moving || (direction === 'up' ? first : last)}
              aria-label={`Move ${category.name} ${direction}`}
            >
              {direction === 'up' ? '↑' : '↓'}
            </Button>
          </form>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          Edit
        </Button>
        <form action={toggle}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="isActive" value={String(!category.isActive)} />
          <Button type="submit" size="sm" variant="outline" disabled={toggling}>
            {category.isActive ? 'Hide' : 'Show'}
          </Button>
        </form>
      </div>
      {editing && (
        <form action={edit} className="grid gap-3 rounded-md border p-3 text-left">
          <input type="hidden" name="id" value={category.id} />
          <Fields state={editState} defaults={category} prefix={`edit-${category.id}`} />
          <SubmitButton className="w-fit">Save</SubmitButton>
        </form>
      )}
      <Message
        state={
          editState.error || editState.done ? editState : moveState.error ? moveState : toggleState
        }
      />
    </div>
  );
}
