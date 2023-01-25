import React from 'react';
import { Location } from '../../common/ResponseTypes';

type PropsType = {
  location: Location,
};

const PurchaseLocation: React.FC<PropsType> = ({ location }) => (
  <div>
    <div>
      {
        location.city && location.region
          ? (
            <>
              <div>{location.address}</div>
              <div>{`${location.city}, ${location.region} ${location.postalCode ?? ''}`}</div>
            </>
          )
          : null
      }
      {
        location.storeNumber
          ? <div>{`Store Number: ${location.storeNumber}`}</div>
          : null
      }
    </div>
    {/* <img
      src={`https://maps.googleapis.com/maps/api/v1/staticmap?markers=color:red%7C${location.lat},${location.lon}&size=480x480&key=${key}`}
      alt=""
      width="480"
      height="480"
      className={styles.image}
      style={{ aspectRatio: `${480} / ${480}` }}
    /> */}
  </div>

);

export default PurchaseLocation;
