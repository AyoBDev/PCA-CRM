import Icons from '../../components/common/Icons';

export default function ScheduleTab({ navigate, clientId }) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Client Schedule</h3>
                    <button className="btn btn--outline btn--sm" onClick={() => navigate('/scheduling')}>
                        {Icons.calendar} View Full Schedule
                    </button>
                </div>
                <div className="cp-card__body">
                    <div className="cp-empty-state-card">
                        <div className="cp-empty-state-card__icon">{Icons.calendar}</div>
                        <p>View this client's shifts on the Scheduling page.</p>
                        <button className="btn btn--primary btn--sm" onClick={() => navigate('/scheduling')}>Go to Scheduling</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
