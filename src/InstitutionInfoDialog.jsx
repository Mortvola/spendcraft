import React, { useState } from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { ModalDialog } from './Modal';

const InstitutionInfoDialog = ({
    onClose,
    title,
    institutionId,
    ...props
}) => {
    const [infoInitialized, setInfoInitialized] = useState(false);
    const [info, setInfo] = useState(null);

    if (!infoInitialized) {
        setInfoInitialized(true);

        fetch(`/institution/${institutionId}/info`)
            .then(
                async (response) => {
                    if (response.ok) {
                        setInfo(await response.json());
                    }
                },
            );
    }

    const product = (value) => {
        switch (value) {
        case 'auth': return 'AUTH';
        case 'balance': return 'BALANCE';
        case 'identity': return 'IDENTITY';
        case 'item_logins': return 'ITEM ADDS';
        case 'transactions_updates': return 'TRANSACTIONS';
        default: return value;
        }
    };

    const percent = (value) => `${(value * 100).toFixed(0)}%`;

    const renderStatus = () => {
        const stats = [];

        if (info.status !== undefined) {
            Object.entries(info.status).forEach(([key, value]) => {
                if (value !== null) {
                    stats.push((
                        <div className="status-item">
                            <div>{product(key)}</div>
                            <div>{value.status}</div>
                            <div>{percent(value.breakdown.success)}</div>
                            <div>{percent(value.breakdown.error_plaid)}</div>
                            <div>{percent(value.breakdown.error_institution)}</div>
                            <div>{moment(value.last_status_change).fromNow()}</div>
                        </div>
                    ));
                }
            });
        }

        return stats;
    };

    const renderForm = () => (
        <div>
            <img src={`data:image/png;base64, ${info.logo}`} alt="logo" width="48" height="48" />
            <a href={info.url} rel="noopener noreferrer" target="_blank">{info.name}</a>
            <div className="status-table">
                {renderStatus()}
            </div>
        </div>
    );

    return (
        <ModalDialog
            onClose={onClose}
            title={title}
            size="lg"
            scrollable
            {...props}
            form={info ? renderForm : null}
        />
    );
};

InstitutionInfoDialog.propTypes = {
    institutionId: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.string,
};

InstitutionInfoDialog.defaultProps = {
    title: 'Institution Information',
};

export default InstitutionInfoDialog;
