import { render } from '@testing-library/react';
import React from 'react';
import { TaskDetailReportsPane } from './TaskDetailReportsPane';
import '@testing-library/jest-dom';

describe('TaskDetailReportsPane', () => {
  it('renders without crashing when empty', () => {
    const { container } = render(<TaskDetailReportsPane reports={[]} loading={false} />);
    expect(container).toBeTruthy();
  });

  it('renders without crashing when loading', () => {
    const { container } = render(<TaskDetailReportsPane reports={[]} loading={true} />);
    expect(container).toBeTruthy();
  });
});
