import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { Provider, connect } from 'react-redux';
import store from './redux/store';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans';

const mapStateToProps = (state) => ({
    view: state.selections.view,
});

const App = connect(mapStateToProps)(({
    view,
}) => {
    const renderMain = () => {
        switch (view) {
        case 'home':
            return <Home />;

        case 'accounts':
            return <Accounts />;

        case 'reports':
            return <Reports />;

        case 'plans':
            return <Plans />;

        default:
            return <div />;
        }
    };

    return (
        <>
            <Menubar />
            <div className="main">
                {renderMain()}
            </div>
        </>
    );
});

App.propTypes = {
    view: PropTypes.string.isRequired,
};

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.querySelector('.app'),
);
