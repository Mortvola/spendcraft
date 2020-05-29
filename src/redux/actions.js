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
    REQUEST_INSTITUTIONS,
    RECEIVE_INSTITUTIONS,
    RECEIVE_CATEGORY_BALANCES,
    RECEIVE_TRANSACTION_CATEGORIES,
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


const fetchAccountTransactions = (accountId) => (
    (dispatch) => {
        dispatch(requestTransactions());

        return (
            fetch(`/account/${accountId}/transactions`)
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

                        return dispatch(receiveTransactions(null, json));
                    },
                )
        );
    }
);

const fetchCategoryTransactions = (categoryId) => (
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

const requestInstitutions = () => ({
    type: REQUEST_INSTITUTIONS,
});

const receiveInstitutions = (institutions) => ({
    type: RECEIVE_INSTITUTIONS,
    institutions,
});

const fetchInstitutions = () => (
    (dispatch) => {
        dispatch(requestInstitutions());

        return (
            fetch('/connected_accounts')
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => dispatch(receiveInstitutions(json)),
                )
        );
    }
);

const receiveCategoryBalances = (balances) => ({
    type: RECEIVE_CATEGORY_BALANCES,
    balances,
});

const receiveTransactionCategories = (transCategories) => ({
    type: RECEIVE_TRANSACTION_CATEGORIES,
    transCategories,
});

export {
    addGroup,
    updateGroup,
    deleteGroup,
    fetchGroups,
    addCategory,
    updateCategory,
    deleteCategory,
    fetchAccountTransactions,
    fetchCategoryTransactions,
    fetchInstitutions,
    receiveCategoryBalances,
    receiveTransactionCategories,
};
