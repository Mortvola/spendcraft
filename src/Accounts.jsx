import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import AccountView from './AccountView';
import IconButton from './IconButton';
import DetailView from './DetailView';
import { showPlaidLink } from './redux/actions';

function onSuccess(publicToken, metadata) {
    fetch('/institution', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicToken, institution: metadata.institution }),
    })
        .then(async (response) => {
            const json = await response.json();

            console.log(json);

            // let newInstitutionElement = createInstitutionElement({
            //     id: json.id, name: json.name, accounts: []
            // });

            // const institutionElements = $('#accounts > div');

            // for (const institutionElement of institutionElements) {
            //     const name = $(institutionElement).find('.institution-name').text();

            //     const compare = name.localeCompare(json.name);

            //     if (compare > 0) {
            //         newInstitutionElement.insertBefore(institutionElement);
            //         newInstitutionElement = null;
            //         break;
            //     }
            // }

            // if (newInstitutionElement !== null) {
            //     newInstitutionElement.appendTo('#accounts');
            // }

            // openAccountSelectionDialog(json.id, json.accounts);
        });
}

const mapStateToProps = (state) => ({
    detailView: state.selections.accountTracking,
});

const Accounts = ({
    detailView,
    dispatch,
}) => {
    const handleClick = () => {
        dispatch(showPlaidLink(onSuccess));
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
