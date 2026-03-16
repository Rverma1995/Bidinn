import React, { useMemo } from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { cn } from '../../lib/utils';

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  headerHeight?: number;
  className?: string;
  onRowClick?: (item: T) => void;
  getRowKey: (item: T) => string;
  emptyMessage?: string;
  maxHeight?: number;
}

export function VirtualizedTable<T>({
  data,
  columns,
  rowHeight = 52,
  headerHeight = 48,
  className,
  onRowClick,
  getRowKey,
  emptyMessage = 'No data found',
  maxHeight = 600,
}: VirtualizedTableProps<T>) {
  // Calculate column widths based on number of columns
  const columnWidths = useMemo(() => {
    return columns.map(col => col.width || `${100 / columns.length}%`);
  }, [columns]);

  // Create row props that will be passed to each row
  const rowProps = useMemo(() => ({
    data,
    columns,
    columnWidths,
    onRowClick,
    getRowKey,
  }), [data, columns, columnWidths, onRowClick, getRowKey]);

  if (data.length === 0) {
    return (
      <div className={cn('rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900', className)}>
        {/* Header */}
        <div
          className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          style={{ height: headerHeight }}
        >
          {columns.map((col, index) => (
            <div
              key={col.key}
              style={{ width: columnWidths[index], minWidth: columnWidths[index] }}
              className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              {col.header}
            </div>
          ))}
        </div>
        {/* Empty State */}
        <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const listHeight = Math.min(data.length * rowHeight, maxHeight - headerHeight);

  // Row renderer function for react-window v2
  const RowRenderer = ({ 
    index, 
    style, 
    data: rowData, 
    columns: cols, 
    columnWidths: widths, 
    onRowClick: onClick, 
    getRowKey: getKey 
  }: {
    index: number;
    style: React.CSSProperties;
    data: T[];
    columns: Column<T>[];
    columnWidths: string[];
    onRowClick?: (item: T) => void;
    getRowKey: (item: T) => string;
  }) => {
    const item = rowData[index];
    return (
      <div
        style={style}
        className={cn(
          'flex items-center border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
          onClick && 'cursor-pointer'
        )}
        onClick={() => onClick?.(item)}
        data-testid={`row-${getKey(item)}`}
      >
        {cols.map((col, colIndex) => (
          <div
            key={col.key}
            style={{ width: widths[colIndex], minWidth: widths[colIndex] }}
            className={cn(
              'px-4 py-2 text-sm truncate',
              col.className
            )}
          >
            {col.render(item, index)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn('rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden', className)}>
      {/* Header */}
      <div
        className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
        style={{ height: headerHeight }}
      >
        {columns.map((col, index) => (
          <div
            key={col.key}
            style={{ width: columnWidths[index], minWidth: columnWidths[index] }}
            className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {col.header}
          </div>
        ))}
      </div>
      
      {/* Virtualized Body */}
      <div style={{ height: listHeight }}>
        <AutoSizer disableHeight>
          {({ width }) => (
            <List
              rowCount={data.length}
              rowHeight={rowHeight}
              overscanCount={5}
              rowProps={rowProps}
              rowComponent={RowRenderer}
              style={{ width: width || '100%', height: listHeight }}
            />
          )}
        </AutoSizer>
      </div>
    </div>
  );
}

export type { Column };
