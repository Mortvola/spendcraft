import {
    ADD_GROUP,
    UPDATE_GROUP,
    DELETE_GROUP,
    REQUEST_GROUPS,
    RECEIVE_GROUPS,
    ADD_CATEGORY,
    UPDATE_CATEGORY,
    DELETE_CATEGORY,
    REQUEST_TRANSACTIONS,
    RECEIVE_TRANSACTIONS,
} from './actionTypes';

const addGroup = (group) => ({
    type: ADD_GROUP,
    group,
});

const updateGroup = (group) => ({
    type: UPDATE_GROUP,
    group,
});

const deleteGroup = (group) => ({
    type: DELETE_GROUP,
    group,
});

const requestGroups = () => ({
    type: REQUEST_GROUPS,
});

const receieveGroups = (groups) => ({
    type: RECEIVE_GROUPS,
    groups,
});

const fetchGroups = () => (
    (dispatch) => {
        dispatch(requestGroups());

        return (
            fetch('/groups')
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => dispatch(receieveGroups(json)),
                )
        );
    }
);

const addCategory = (category) => ({
    type: ADD_CATEGORY,
    category,
});

const updateCategory = (category) => ({
    type: UPDATE_CATEGORY,
    category,
});

const deleteCategory = (category) => ({
    type: DELETE_CATEGORY,
    category,
});

const requestTransactions = () => ({
    type: REQUEST_TRANSACTIONS,
});

const receiveTransactions = (categoryId, transactions) => ({
    type: RECEIVE_TRANSACTIONS,
    categoryId,
    transactions,
});

const fetchTransactions = (categoryId) => (
    (dispatch) => {
        dispatch(requestTransactions());

        return (
            fetch(`/category/${categoryId}/transactions`)
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => {
                        json.transactions.sort((a, b) => {
                            if (a.date < b.date) {
                                return 1;
                            }

                            if (a.date > b.date) {
                                return -1;
                            }

                            if (a.sort_order < b.sort_order) {
                                return 1;
                            }

                            if (a.sort_order > b.sort_order) {
                                return -1;
                            }

                            return 0;
                        });

                        return dispatch(receiveTransactions(categoryId, json));
                    },
                )
        );
    }
);

export {
    addGroup,
    updateGroup,
    deleteGroup,
    requestGroups,
    receieveGroups,
    fetchGroups,
    addCategory,
    updateCategory,
    deleteCategory,
    requestTransactions,
    receiveTransactions,
    fetchTransactions,
};
