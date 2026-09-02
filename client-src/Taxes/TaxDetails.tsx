import { runInAction } from 'mobx';
import React from 'react';
import { useStores } from '../State/Store';
import { observer } from 'mobx-react-lite';
import style from './TaxDetails.module.scss'
import TaxComputation from './TaxComputation';
import Income from './Income';
import TaxAndCredits from './TaxAndCredits';
import { FilingStatus } from '../../common/ResponseTypes';
import { Tab, Tabs } from 'react-bootstrap';
import CapitalGains from './CapitalGains';
import Worksheet2_1 from './Worksheet2-1';
import Worksheet2_9 from './Worksheet2-9';
import Worksheet2_10 from './Worksheet2-10';

const TaxDetails: React.FC = observer(() => {
  const { taxes } = useStores()

  React.useEffect(() => {
    taxes.load()
  }, [taxes])

  const handleFileStatusChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
    runInAction(() => {
      taxes.filingStatus = (event.target.value as unknown) as FilingStatus
    })
  }

  const handleSave = () => {
    taxes.save();
  }

  return (
    <div className={style.layout}>
      <div className={style.main}>
        <div>
          <TaxComputation taxes={taxes} />
        </div>

        <div className={style.details}>
          <div className={style.form}>
            <label>
              Filing Status: 
              <select value={taxes.filingStatus} onChange={handleFileStatusChange}>
                <option value={FilingStatus.Single}>Single</option>
                <option value={FilingStatus.MarriedFilingSeparate}>Married Filing Separate</option>
                <option value={FilingStatus.MarriedFilingJointly}>Married Filing Jointly</option>
                <option value={FilingStatus.HeadOfHousehold}>Head of Household</option>
              </select>
            </label>
          </div>

          <div className={style.tabs}>
            <Tabs className="mb-3" mountOnEnter unmountOnExit>
              <Tab eventKey="income" title="Income">
                <Income taxes={taxes} />
              </Tab>

              <Tab eventKey="tax-and-credits" title="Tax and Credits">
                <TaxAndCredits taxes={taxes} />
              </Tab>

              <Tab eventKey="capital-gains" title="Capital Gains and Losses">
                <CapitalGains taxes={taxes} />
              </Tab>

              <Tab eventKey="worksheet2-1" title="Worksheet 2-1">
                <Worksheet2_1 taxes={taxes} />
              </Tab>

              <Tab eventKey="worksheet2-9" title="Worksheet 2-9">
                <Worksheet2_9 taxes={taxes} />
              </Tab>

              <Tab eventKey="worksheet2-10" title="Worksheet 2-10">
                <Worksheet2_10 taxes={taxes} />
              </Tab>
            </Tabs>
          </div>
        </div>
      </div>

      <button onClick={handleSave}>Save</button>
    </div>
  )
})

export default TaxDetails;
