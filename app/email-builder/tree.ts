/* ============================================================
   BLOCK TREE OPERATIONS

   Every edit the builder makes to the block list goes through
   one of these. They never mutate: each returns a new array, so
   undo/redo can keep old versions around for free and React
   sees a new reference when something changed.

   A container is addressed by a string key:
     "root"           the email body
     "<columnsId>:0"  left column of a Columns block
     "<columnsId>:1"  right column
   ============================================================ */

import {
  canNestInColumn,
  newBlockId,
  type Block,
  type ColumnsBlock,
  type LeafBlock,
} from "./schema";

export const ROOT = "root";

export type ContainerKey = string;

export function columnKey(columnsId: string, column: 0 | 1): ContainerKey {
  return `${columnsId}:${column}`;
}

function parseKey(key: ContainerKey) {
  if (key === ROOT) return null;
  const at = key.lastIndexOf(":");
  const column = Number(key.slice(at + 1));
  return {
    parentId: key.slice(0, at),
    column: (column === 1 ? 1 : 0) as 0 | 1,
  };
}

export function getContainer(blocks: Block[], key: ContainerKey): Block[] | null {
  const parsed = parseKey(key);
  if (!parsed) return blocks;

  const parent = blocks.find((b) => b.id === parsed.parentId);
  if (!parent || parent.type !== "columns") return null;
  return parent.columns[parsed.column];
}

export function findBlock(
  blocks: Block[],
  id: string,
): { block: Block; container: ContainerKey; index: number } | null {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.id === id) return { block, container: ROOT, index: i };

    if (block.type === "columns") {
      for (const column of [0, 1] as const) {
        const cells = block.columns[column];
        const j = cells.findIndex((c) => c.id === id);
        if (j !== -1) {
          return {
            block: cells[j],
            container: columnKey(block.id, column),
            index: j,
          };
        }
      }
    }
  }
  return null;
}

export function countBlocks(blocks: Block[]): number {
  let total = 0;
  for (const block of blocks) {
    total += 1;
    if (block.type === "columns") {
      total += block.columns[0].length + block.columns[1].length;
    }
  }
  return total;
}

/* Replace a container's contents, returning the new tree. */
function withContainer(
  blocks: Block[],
  key: ContainerKey,
  next: Block[],
): Block[] {
  const parsed = parseKey(key);
  if (!parsed) return next;

  return blocks.map((block) => {
    if (block.id !== parsed.parentId || block.type !== "columns") return block;
    const columns: [LeafBlock[], LeafBlock[]] = [
      block.columns[0],
      block.columns[1],
    ];
    columns[parsed.column] = next as LeafBlock[];
    return { ...block, columns };
  });
}

/* Whether `block` may be placed into the container `key`. */
export function canDrop(
  blocks: Block[],
  key: ContainerKey,
  block: Pick<Block, "type" | "id">,
): boolean {
  const parsed = parseKey(key);
  if (!parsed) return true;
  if (!canNestInColumn(block.type)) return false;
  if (parsed.parentId === block.id) return false;
  return getContainer(blocks, key) !== null;
}

export function insertBlock(
  blocks: Block[],
  key: ContainerKey,
  index: number,
  block: Block,
): Block[] {
  const container = getContainer(blocks, key);
  if (!container || !canDrop(blocks, key, block)) return blocks;

  const at = Math.max(0, Math.min(index, container.length));
  const next = [...container.slice(0, at), block, ...container.slice(at)];
  return withContainer(blocks, key, next);
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;

  const container = getContainer(blocks, found.container) as Block[];
  const next = container.filter((b) => b.id !== id);
  return withContainer(blocks, found.container, next);
}

/* Move a block to `index` in container `key`. `index` is counted
   in the container as it looks BEFORE the block is lifted out,
   which is what a drop indicator between two rows means. */
export function moveBlock(
  blocks: Block[],
  id: string,
  key: ContainerKey,
  index: number,
): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  if (!canDrop(blocks, key, found.block)) return blocks;

  let target = index;
  if (found.container === key && found.index < index) {
    target -= 1;
  }
  if (found.container === key && found.index === target) {
    return blocks;
  }

  const lifted = removeBlock(blocks, id);
  return insertBlock(lifted, key, target, found.block);
}

/* Up or down one place within the same container, for keyboard
   and touch users who cannot drag. */
export function moveBy(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;

  const container = getContainer(blocks, found.container) as Block[];
  const target = found.index + delta;
  if (target < 0 || target >= container.length) return blocks;

  const next = [...container];
  next.splice(found.index, 1);
  next.splice(target, 0, found.block);
  return withContainer(blocks, found.container, next);
}

export function cloneWithNewIds<T extends Block>(block: T): T {
  const copy = JSON.parse(JSON.stringify(block)) as T;
  copy.id = newBlockId();
  if (copy.type === "columns") {
    const columns = (copy as ColumnsBlock).columns;
    for (const column of columns) {
      for (const child of column) child.id = newBlockId();
    }
  }
  return copy;
}

/* Returns the new tree and the id of the copy, so the builder
   can select it. */
export function duplicateBlock(
  blocks: Block[],
  id: string,
): { blocks: Block[]; newId: string | null } {
  const found = findBlock(blocks, id);
  if (!found) return { blocks, newId: null };

  const copy = cloneWithNewIds(found.block);
  return {
    blocks: insertBlock(blocks, found.container, found.index + 1, copy),
    newId: copy.id,
  };
}

export function updateBlockProperties(
  blocks: Block[],
  id: string,
  patch: Record<string, unknown>,
): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;

  const updated = {
    ...found.block,
    properties: { ...found.block.properties, ...patch },
  } as Block;

  const container = getContainer(blocks, found.container) as Block[];
  const next = container.map((b) => (b.id === id ? updated : b));
  return withContainer(blocks, found.container, next);
}
