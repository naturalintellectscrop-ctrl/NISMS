import { Request } from 'express';

export interface PageParams {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

export function getPageParams(req: Request, defaultSize = 20, maxSize = 100): PageParams {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt((req.query.pageSize as string) ?? String(defaultSize), 10) || defaultSize));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function pageResult<T>(items: T[], total: number, params: PageParams) {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}
