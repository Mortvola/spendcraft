import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { Provider, connect } from 'react-redux';
import { usePlaidLink } from 'react-plaid-link';
import CategoryView from './CategoryView';
import AccountView from './AccountView';
import RegisterElement from './RegisterElement';
import { ModalLauncher } from './Modal';
import GroupDialog from './GroupDialog';
import FundingDialog from './funding/FundingDialog';
import RebalanceDialog from './rebalance/RebalanceDialog';
import store from './redux/store';
import IconButton from './IconButton';
import { plaidConfig, onSuccess } from './Accounts';
import BalanceHistory from './BalanceHistory';

const mapStateToProps = (state) => ({
    historyView: state.selections.accountTracking === 'Balances',
});

const App = connect(mapStateToProps)(({
    historyView,
}) => {
    const { open } = usePlaidLink({ ...plaidConfig, onSuccess });

    const renderDetailView = () => {
        if (historyView) {
            return <BalanceHistory />;
        }

        return <RegisterElement />;
    };

    return (
        <>
            <div className="side-bar">
                <div className="categories">
                    <div className="tools">
                        <ModalLauncher
                            launcher={(props) => (<button type="button" id="add-group" className="button" {...props}>Add Group</button>)}
                            title="Add Group"
                            dialog={(props) => (<GroupDialog {...props} />)}
                        />
                        <ModalLauncher
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Rebalance</button>)}
                            dialog={(props) => (<RebalanceDialog {...props} />)}
                        />
                        <ModalLauncher
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Fund</button>)}
                            dialog={(props) => (<FundingDialog {...props} />)}
                        />
                    </div>
                    <CategoryView />
                </div>
                <div className="accounts">
                    <div className="account-bar">
                        <div>Institutions</div>
                        <IconButton icon="plus" onClick={open} />
                    </div>
                    <AccountView />
                </div>
            </div>
            {renderDetailView()}
        </>
    );
});

App.propTypes = {
    historyView: PropTypes.bool.isRequired,
};

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.querySelector('.main'),
);
