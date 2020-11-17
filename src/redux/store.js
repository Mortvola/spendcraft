import thunkMiddleware from 'redux-thunk';
import { createLogger } from 'redux-logger';
import { createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import budgetApp from './reducers';
import { fetchUser, fetchGroups, fetchInstitutions } from './actions';

const middlewares = [thunkMiddleware];

if (process.env.NODE_ENV !== 'production') {
  middlewares.push(createLogger());
}

const store = createStore(
  budgetApp,
  composeWithDevTools(
    applyMiddleware(...middlewares),
  ),
);

store.dispatch(fetchUser());
store.dispatch(fetchGroups());
store.dispatch(fetchInstitutions());

export default store;
