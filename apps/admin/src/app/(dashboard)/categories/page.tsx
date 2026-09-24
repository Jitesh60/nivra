import type { Metadata } from 'next';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, unwrap } from '@/lib/api';
import { adminFor } from '@/lib/guard';
import { CategoryRowActions, CreateCategoryForm } from './category-forms';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  if (!(await adminFor('/categories'))) return <Forbidden />;
  const categories = await unwrap((await adminApi()).GET('/v1/admin/categories'));
  const order = categories.map((c) => c.id);

  return (
    <>
      <PageHeader
        title="Categories"
        description="What lenders choose from, in the order the apps show them. Hiding a category keeps its listings but stops new ones."
      />
      <div className="mb-6 rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Listings</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c, i) => (
              <TableRow key={c.id} data-testid="category-row">
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">
                    {c.name}{' '}
                    {!c.isActive && (
                      <Badge variant="outline" data-testid="category-hidden">
                        hidden
                      </Badge>
                    )}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{c.icon}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{c.slug}</TableCell>
                <TableCell>{c.listingCount}</TableCell>
                <TableCell className="text-right">
                  <CategoryRowActions
                    category={c}
                    order={order}
                    first={i === 0}
                    last={i === categories.length - 1}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CreateCategoryForm />
    </>
  );
}
