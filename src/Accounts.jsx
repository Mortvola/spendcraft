import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import AccountView from './AccountView';
import IconButton from './IconButton';
import DetailView from './DetailView';
import { showPlaidLink } from './redux/actions';

const mapStateToProps = (state) => ({
    detailView: state.selections.accountTracking,
});

const Accounts = ({
    detailView,
    dispatch,
}) => {
    const handleClick = () => {
        dispatch(showPlaidLink());
    };

    return (
        <>
            <div className="side-bar">
                <div className="accounts">
                    <div className="account-bar">
                        <div>Institutions</div>
                        <IconButton icon="plus" onClick={handleClick} />
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
    dispatch: PropTypes.func.isRequired,
};

export default connect(mapStateToProps)(Accounts);
