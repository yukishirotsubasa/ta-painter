import { describe, expect, it } from 'vitest';
import type { DrawnLine } from './drawingController';
import { keepSelection, selectionAfterCollapse, toggleSelection } from './lineSelection';

function lines(...ids: string[]): DrawnLine[] {
  return ids.map((id) => ({ id, points: null, color: '#fff', width: 2 }));
}

describe('keepSelection', () => {
  it('keeps the selection while the line is still in the list', () => {
    expect(keepSelection('line-2', lines('line-1', 'line-2'))).toBe('line-2');
  });

  it('drops the selection when the selected line was deleted', () => {
    expect(keepSelection('line-2', lines('line-1'))).toBeNull();
  });

  it('drops the selection when every line was cleared (symbol switch)', () => {
    expect(keepSelection('line-1', [])).toBeNull();
  });

  it('stays null when nothing was selected', () => {
    expect(keepSelection(null, lines('line-1'))).toBeNull();
  });
});

describe('toggleSelection', () => {
  it('selects a different line', () => {
    expect(toggleSelection('line-1', 'line-2')).toBe('line-2');
  });

  it('deselects when the already selected line is tapped again', () => {
    expect(toggleSelection('line-2', 'line-2')).toBeNull();
  });

  it('selects from an empty selection', () => {
    expect(toggleSelection(null, 'line-1')).toBe('line-1');
  });
});

describe('selectionAfterCollapse', () => {
  it('keeps the selection while both the sidebar and the section are open', () => {
    expect(selectionAfterCollapse('line-1', false, false)).toBe('line-1');
  });

  it('clears the selection when the drawing section collapses', () => {
    expect(selectionAfterCollapse('line-1', false, true)).toBeNull();
  });

  it('clears the selection when the whole sidebar collapses', () => {
    expect(selectionAfterCollapse('line-1', true, false)).toBeNull();
  });
});
