import * as CarbonIcons from '@carbon/icons-react'
import React, { CSSProperties, ReactNode, useState } from 'react'
import styled from 'styled-components'
import { ArtColumn, SortItem, SortOrder, TableTransform } from '../interfaces'
import { safeGetValue, safeRenderHeader } from '../internals'
import { collectNodes, smartCompare, isLeafNode, layeredSort } from '../utils'

type IconComponent = typeof CarbonIcons.Number_116

function SortIcon({
  size = 32,
  style,
  className,
  order,
}: {
  style?: CSSProperties
  className?: string
  size?: number
  order?: SortOrder
}) {
  return (
    <svg
      style={style}
      className={className}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <path fill={order === 'asc' ? '#23A3FF' : '#bfbfbf'} transform="translate(0, 4)" d="M8 8L16 0 24 8z" />
      <path fill={order === 'desc' ? '#23A3FF' : '#bfbfbf'} transform="translate(0, -4)" d="M24 24L16 32 8 24z " />
    </svg>
  )
}

const NumberIconMap: { [key: number]: IconComponent } = {
  1: CarbonIcons.Number_116,
  2: CarbonIcons.Number_216,
  3: CarbonIcons.Number_316,
  4: CarbonIcons.Number_416,
  5: CarbonIcons.Number_516,
  6: CarbonIcons.Number_616,
  7: CarbonIcons.Number_716,
  8: CarbonIcons.Number_816,
  9: CarbonIcons.Number_916,
}

const EmptyIcon: IconComponent = () => null

function DefaultSortHeaderCell({ children, column, onToggle, sortOrder, sortIndex, sortOptions }: SortHeaderCellProps) {
  // 通过 justify-content 来与 col.align 保持对齐方向一致
  const justifyContent = column.align === 'right' ? 'flex-end' : column.align === 'center' ? 'center' : 'flex-start'

  let NumberIcon = EmptyIcon
  if (sortOptions.mode === 'multiple') {
    if (NumberIconMap[sortIndex + 1] != null) {
      NumberIcon = NumberIconMap[sortIndex + 1]
    }
  }

  return (
    <TableHeaderCell onClick={onToggle} style={{ justifyContent }}>
      {children}
      <SortIcon style={{ marginLeft: 2, flexShrink: 0 }} size={16} order={sortOrder} />
      <NumberIcon style={{ fill: '#666', flexShrink: 0 }} />
    </TableHeaderCell>
  )
}

function hasAnySortableColumns(cols: ArtColumn[]): boolean {
  return cols.some(
    (col) => Boolean(col.features?.sortable) || (!isLeafNode(col) && hasAnySortableColumns(col.children)),
  )
}

const TableHeaderCell = styled.div`
  cursor: pointer;
  display: flex;
  align-items: center;
`

export interface SortHeaderCellProps {
  /** 调用 makeSortTransform(...) 时的参数 */
  sortOptions: Required<Omit<SortOptions, 'SortHeaderCell'>>

  /** 在添加排序相关的内容之前 表头原有的渲染内容 */
  children: ReactNode

  /** 当前排序 */
  sortOrder: SortOrder

  /** 多列排序下，sortIndex 指明了当前排序字段起作用的顺序. 当 sortOrder 为 none 时，sortIndex 固定为 -1 */
  sortIndex: number

  /** 当前列的配置 */
  column: ArtColumn

  /** 切换排序的回调 */
  onToggle(): void
}

export interface SortOptions {
  /** 排序字段列表 */
  sorts: SortItem[]

  /** 更新排序字段列表的回调函数 */
  onChangeSorts(nextSorts: SortItem[]): void

  /** 排序切换顺序 */
  orders?: SortOrder[]

  /** 排序模式。单选 single，多选 multiple，默认为多选 */
  mode?: 'single' | 'multiple'

  /** 自定义排序表头 */
  SortHeaderCell?: React.ComponentType<SortHeaderCellProps>

  /** 是否保持 dataSource 不变 */
  keepDataSource?: boolean
}

export function makeSortTransform({
  sorts: inputSorts,
  onChangeSorts: inputOnChangeSorts,
  orders = ['desc', 'asc', 'none'],
  mode = 'multiple',
  SortHeaderCell,
  keepDataSource,
}: SortOptions): TableTransform {
  const filteredInputSorts = inputSorts.filter((s) => s.order !== 'none')

  // 单字段排序的情况下 sorts 中只有第一个排序字段才会生效
  const sorts = mode === 'multiple' ? filteredInputSorts : filteredInputSorts.slice(0, 1)
  const onChangeSorts =
    mode === 'multiple'
      ? inputOnChangeSorts
      : (nextSorts: SortItem[]) => {
          // 单字段排序的情况下，nextSorts 中只有最后一个排序字段才会生效
          const len = nextSorts.length
          inputOnChangeSorts(nextSorts.slice(len - 1))
        }

  const sortOptions = { sorts, onChangeSorts, orders, mode, keepDataSource }

  const sortMap = new Map(sorts.map((sort, index) => [sort.code, { index, ...sort }]))

  return ({ dataSource, columns }) => {
    if (process.env.NODE_ENV !== 'production') {
      if (!hasAnySortableColumns(columns)) {
        console.warn(
          'ali-react-table commonTransform.sort 缺少可排序的列，请通过 column.features.sortable 来指定哪些列可排序',
          columns,
        )
      }
    }

    return { columns: processColumns(columns), dataSource: processDataSource(dataSource) }

    function processDataSource(dataSource: any[]) {
      if (keepDataSource) {
        return dataSource
      }

      const sortColumnsMap = new Map(
        collectNodes(columns, 'leaf-only')
          .filter((col) => col.features?.sortable != null)
          .map((col) => [col.code, col]),
      )
      return layeredSort(dataSource, (x, y) => {
        for (const { code, order } of sorts) {
          const column = sortColumnsMap.get(code)
          // 如果 code 对应的 column 不可排序，我们跳过该 code
          if (column == null) {
            continue
          }
          const sortable = column.features.sortable
          const compareFn = typeof sortable === 'function' ? sortable : smartCompare
          const xValue = safeGetValue(column, x, -1)
          const yValue = safeGetValue(column, y, -1)
          const cmp = compareFn(xValue, yValue)
          if (cmp !== 0) {
            return cmp * (order === 'asc' ? 1 : -1)
          }
        }
        return 0
      })
    }

    // 在「升序 - 降序 - 不排序」之间不断切换
    function toggle(code: string) {
      const sort = sortMap.get(code)
      if (sort == null) {
        onChangeSorts(sorts.concat([{ code, order: orders[0] }]))
      } else {
        const index = sorts.findIndex((s) => s.code === code)
        const nextSorts = sorts.slice(0, index + 1)
        const nextOrder = getNextOrder(sort.order)
        if (nextOrder === 'none') {
          nextSorts.pop()
        } else {
          nextSorts[index] = { ...nextSorts[index], order: nextOrder }
        }
        onChangeSorts(nextSorts)
      }
    }

    function processColumns(columns: ArtColumn[]) {
      return columns.map(dfs)

      function dfs(col: ArtColumn): ArtColumn {
        const result = { ...col }

        if (col.code && (col.features?.sortable || sortMap.has(col.code))) {
          let sortIndex = -1
          let sortOrder: SortOrder = 'none'

          if (sortMap.has(col.code)) {
            const { order, index } = sortMap.get(col.code)
            sortOrder = order
            sortIndex = index
          }

          const SortHeaderCellComponent = SortHeaderCell ?? DefaultSortHeaderCell
          result.title = (
            <SortHeaderCellComponent
              onToggle={() => toggle(col.code)}
              sortOrder={sortOrder}
              column={col}
              sortIndex={sortIndex}
              sortOptions={sortOptions}
            >
              {safeRenderHeader(col)}
            </SortHeaderCellComponent>
          )
        }
        if (!isLeafNode(col)) {
          result.children = col.children.map(dfs)
        }

        return result
      }
    }
  }

  function getNextOrder(order: SortOrder) {
    const idx = orders.indexOf(order)
    return orders[idx === orders.length - 1 ? 0 : idx + 1]
  }
}

export function useSortTransform({
  defaultSorts = [],
  ...others
}: Omit<SortOptions, 'sorts' | 'onChangeSorts'> & { defaultSorts?: SortItem[] } = {}) {
  const [sorts, onChangeSorts] = useState(defaultSorts)
  return makeSortTransform({ sorts, onChangeSorts, ...others })
}
