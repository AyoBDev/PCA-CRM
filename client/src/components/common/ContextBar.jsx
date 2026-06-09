export default function ContextBar({ children }) {
    return (
        <div className="context-bar">
            {children}
        </div>
    );
}

ContextBar.Left = function ContextBarLeft({ children }) {
    return <div className="context-bar__left">{children}</div>;
};

ContextBar.Right = function ContextBarRight({ children }) {
    return <div className="context-bar__right">{children}</div>;
};
