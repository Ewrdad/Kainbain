import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlassesApprovalConfirm } from './GlassesApprovalConfirm.jsx';
import '@testing-library/jest-dom';

/***
 * MARK: GlassesApprovalConfirm tests
 * @description Guards the glasses approve safety step: confirm and cancel
 *   call their own callbacks, Escape cancels without approving, and both
 *   buttons lock while the approve is in flight.
 ***/
describe('GlassesApprovalConfirm', () => {
  it('asks Are you sure with the task name', () => {
    render(<GlassesApprovalConfirm taskName="Fix race" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('glasses-approval-confirm')).toHaveTextContent('Are you sure?');
    expect(screen.getByTestId('glasses-approval-confirm')).toHaveTextContent('Fix race');
  });

  it('confirm calls onConfirm and never onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<GlassesApprovalConfirm onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancel calls onCancel and never onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<GlassesApprovalConfirm onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape cancels without approving', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<GlassesApprovalConfirm onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByTestId('glasses-approval-confirm'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while busy', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<GlassesApprovalConfirm onConfirm={onConfirm} onCancel={onCancel} isBusy />);
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
