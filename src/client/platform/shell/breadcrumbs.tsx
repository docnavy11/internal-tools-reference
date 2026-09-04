import { Fragment } from 'react';
import { Link, useMatches } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/platform/ui/breadcrumb';

/** Routes describe their own crumb: `handle: { title: 'Users' }` in router.tsx. */
export interface RouteHandle {
  title?: string;
}

export function RouteBreadcrumb() {
  const matches = useMatches();
  const crumbs = matches.flatMap((match) => {
    const title = (match.handle as RouteHandle | undefined)?.title;
    return title ? [{ title, to: match.pathname }] : [];
  });

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.to}>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
