import React, { useState } from 'react';
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
    const [refreshing, setRefreshing] = useState(false);

    const handleClick = () => {
        dispatch(showPlaidLink());
    };

    const handleRefresh = () => {
        setRefreshing(true);

        fetch('/institutions/sync', {
            method: 'POST',
            headers:
            {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json',
            },
        })
            .then(
                (response) => response.json(),
                (error) => console.log('fetch error: ', error),
            )
            .then(() => {
                // const { categories } = json;
                // if (categories && categories.length > 0) {
                //     dispatch(receiveCategoryBalances(categories));
                // }

                // document.dispatchEvent(new Event('accountRefreshed'));
                setRefreshing(false);
            });
    };

    let rotate = false;
    if (refreshing) {
        rotate = true;
    }

    return (
        <>
            <div className="side-bar">
                <div className="accounts">
                    <div className="account-bar">
                        <div>Institutions</div>
                        <IconButton icon="plus" onClick={handleClick} />
                        <IconButton icon="sync-alt" rotate={rotate} onClick={handleRefresh} />
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
