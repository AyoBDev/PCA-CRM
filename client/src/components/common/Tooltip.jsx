import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

/**
 * App-wide tooltip. Wraps @radix-ui/react-tooltip so the dependency stays behind
 * our own interface (swapping libraries later is a one-file change). Radix gives
 * us Floating-UI collision positioning and full WAI-ARIA a11y (aria-describedby,
 * keyboard focus, Escape to dismiss) for free; we only supply the styling via the
 * `.tooltip-content` class (see index.css, uses the popover/border/radius tokens).
 *
 * Usage:
 *   <Tooltip content="Explain this">
 *     <button>?</button>   // any focusable/hoverable trigger
 *   </Tooltip>
 *
 * The trigger is rendered as-is via `asChild`, so it keeps its own element/styles.
 * A single <TooltipProvider> is mounted once at the app root (main.jsx); the
 * `delayDuration` here overrides the provider default per-tooltip.
 */
export default function Tooltip({
    content,
    children,
    side = 'top',
    align = 'center',
    delayDuration = 150,
    sideOffset = 6,
}) {
    if (!content) return children;
    return (
        <RadixTooltip.Root delayDuration={delayDuration}>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
            <RadixTooltip.Portal>
                <RadixTooltip.Content
                    className="tooltip-content"
                    side={side}
                    align={align}
                    sideOffset={sideOffset}
                    collisionPadding={8}
                >
                    {content}
                    <RadixTooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}

/**
 * Mount once near the app root. `delayDuration` is the default hover delay for all
 * tooltips; individual <Tooltip>s can override it. `skipDelayDuration` lets a user
 * move between adjacent tooltips without re-waiting the full delay.
 */
export function TooltipProvider({ children }) {
    return (
        <RadixTooltip.Provider delayDuration={150} skipDelayDuration={300}>
            {children}
        </RadixTooltip.Provider>
    );
}
