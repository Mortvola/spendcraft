import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { fetchPlan } from '../redux/actions';
import PlanItem from './PlanItem';
import PlanDetails from './PlanDetails';
import { ModalLauncher } from '../Modal';

const mapStateToProps = (state) => ({
  plans: state.plans.list,
  plan: state.plans.plan,
});

const Plans = ({
  plans,
  plan,
  dispatch,
}) => {
  const handleSelect = (p) => {
    dispatch(fetchPlan(p.id));
  };

  const renderPlanList = () => {
    const list = [];

    plans.forEach((p) => {
      list.push((<PlanItem key={p.id} plan={p} onSelect={handleSelect} />));
    });

    return list;
  };

  const renderPlanDetails = () => {
    if (plan) {
      return <PlanDetails plan={plan} />;
    }

    return <div />;
  };

  return (
    <>
      <div className="side-bar">
        <div className="plan-tools">
          <ModalLauncher
            launcher={(props) => (<button type="button" id="add-group" className="button" {...props}>Add Plan</button>)}
            title="Add Group"
            dialog={(props) => (<AddPlanDialog {...props} />)}
          />
        </div>
        {renderPlanList()}
      </div>
      {renderPlanDetails()}
    </>
  );
};

Plans.propTypes = {
  plans: PropTypes.arrayOf(PropTypes.shape()),
  plan: PropTypes.shape(),
  dispatch: PropTypes.func.isRequired,
};

Plans.defaultProps = {
  plans: [],
  plan: null,
};

export default connect(mapStateToProps)(Plans);
