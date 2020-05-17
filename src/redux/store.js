import thunkMiddleware from 'redux-thunk';
import { createLogger } from 'redux-logger';
import { createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import budgetApp from './reducers';
import { fetchGroups } from './actions';

const loggerMiddleware = createLogger();

const store = createStore(
    budgetApp,
    composeWithDevTools (
        applyMiddleware(
            thunkMiddleware, // lets us dispatch() functions
            loggerMiddleware, // neat middleware that logs actions
        ),
    )
);

store.dispatch(fetchGroups());

export default store;
