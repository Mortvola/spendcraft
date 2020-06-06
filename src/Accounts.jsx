import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { usePlaidLink } from 'react-plaid-link';
import { plaidConfig, onSuccess } from './AccountsDialog';
import AccountView from './AccountView';
import IconButton from './IconButton';
import DetailView from './DetailView';

const mapStateToProps = (state) => ({
    detailView: state.selections.accountTracking,
});

const Accounts = ({
    detailView,
}) => {
    const { open } = usePlaidLink({ ...plaidConfig, onSuccess });

    return (
        <>
            <div className="side-bar">
                <div className="accounts">
                    <div className="account-bar">
                        <div>Institutions</div>
                        <IconButton icon="plus" onClick={open} />
                    </div>
                    <AccountView />
                </div>
            </div>
            <DetailView detailView={detailView} />
        </>
    );
};

Accounts.propTypes = {
    detailView: PropTypes.bool.isRequired,
};

export default connect(mapStateToProps)(Accounts);
