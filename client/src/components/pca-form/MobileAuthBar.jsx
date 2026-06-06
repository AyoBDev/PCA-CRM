import { memo } from 'react';

function MobileAuthBar({ authLimits, totalPas, totalHm, totalRespite, totalCompanion }) {
    if (!authLimits || Object.keys(authLimits).length === 0) return null;

    return (
        <div className="pcaf-mauth">
            {authLimits.PAS && (
                <span className="pcaf-mauth__pill pcaf-mauth__pill--pas">
                    PAS: {totalPas.toFixed(1)} / {authLimits.PAS.hours} hrs
                </span>
            )}
            {authLimits.Homemaker && (
                <span className="pcaf-mauth__pill pcaf-mauth__pill--hm">
                    HM: {totalHm.toFixed(1)} / {authLimits.Homemaker.hours} hrs
                </span>
            )}
            {authLimits.Respite && (
                <span className="pcaf-mauth__pill pcaf-mauth__pill--respite">
                    Respite: {totalRespite.toFixed(1)} / {authLimits.Respite.hours} hrs
                </span>
            )}
            {authLimits.Companion && (
                <span className="pcaf-mauth__pill pcaf-mauth__pill--companion">
                    Companion: {(totalCompanion || 0).toFixed(1)} / {authLimits.Companion.hours} hrs
                </span>
            )}
        </div>
    );
}

export default memo(MobileAuthBar);
