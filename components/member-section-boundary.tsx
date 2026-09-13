'use client';
import { Component, type ReactNode } from 'react';
import { isModuleLoadError, reportClientFault } from '@/lib/client-module';

export class MemberSectionBoundary extends Component<
  { section: 'Home' | 'Markets'; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportClientFault(error, this.props.section);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const moduleError = isModuleLoadError(this.state.error);
    return (
      <section className="section-load-error" role="alert">
        <h2>{this.props.section} couldn’t load</h2>
        <p>
          {moduleError
            ? 'A page file could not be downloaded.'
            : 'Something went wrong in this section.'}
        </p>
        <div>
          {!moduleError && (
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Reload Float
          </button>
        </div>
      </section>
    );
  }
}
